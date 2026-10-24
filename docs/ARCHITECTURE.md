# Arquitectura

> Fuente de verdad del producto: [PROJECT_MANIFESTO.md](PROJECT_MANIFESTO.md).
> Este documento describe **cómo** se cumple; si hay discrepancia, gana el manifiesto.

## 1. Principios

1. **Todo en el cliente.** Visión y audio corren en el navegador. El servidor solo sirve archivos
   y gestiona el inventario de licencias. Ningún frame de video se envía a la red.
2. **Sin build.** ES modules nativos, CSS plano y `node --test`. Se sirve tal cual.
3. **Una sola dependencia vendorizada:** `app/vendor/jsqr.js` (Apache-2.0) para leer QR sin red.
4. **Matemática pura en el centro, efectos en el borde.** Transporte, máscara, capas y columnas
   son funciones sin DOM para poder probarlas con `node --test`.
5. **Reloj único:** `AudioContext.currentTime`. `setTimeout` solo despierta al planificador.
6. **Cero allocations por frame** en el pipeline de visión (buffers reutilizados).

## 2. Mapa de módulos

```
app/src/
  core/config.js        constantes, colores, límites, claves de storage
  core/util.js          clamp, lerp, mod, ema, createId
  platform/storage.js   localStorage seguro (try/catch, JSON)

  auth/token.js         formato MT-XXXX-XXXX-XXXX-C + checksum
  auth/api.js           cliente HTTP de /api/license/*
  auth/license.js       licencia local, demo de 20 min, deviceId
  auth/qr.js            BarcodeDetector → jsQR → foto → entrada manual

  vision/background.js  modelo de fondo + deriva de luz
  vision/mask.js        umbral dinámico, histéresis, cromaticidad
  vision/morphology.js  apertura/cierre 3×3 separable
  vision/components.js  etiquetado 8-conectado, área, caja, fill
  vision/layers.js      bandas de color verticales (torres)
  vision/columns.js     confirmación, TTL y estado musical por columna
  vision/align.js       estimación de traslación + desplazamiento del fondo
  vision/engine.js      orquesta el pipeline; sin rAF propio
  vision/camera.js      getUserMedia + ciclo de vida del stream
  vision/simulator.js   escena sintética (misma interfaz que la cámara)

  sequencer/transport.js  recta temporal, BPM, columnas, fronteras
  sequencer/scheduler.js  lookahead sobre el reloj de audio
  sequencer/pattern.js    escalas y altura → semitonos

  audio/synth.js        síntesis offline de samples (sin assets)
  audio/kits.js         kits y mapeos color → sample
  audio/engine.js       AudioContext, voces, ganancia, mute

  ui/dom.js             helpers mínimos de DOM
  ui/overlay.js         video + rejilla + barrido + cajas + destellos
  ui/hud.js             chips de estado, banner y toasts
  ui/dock.js            controles del profesor
  ui/sheets.js          hojas de sonidos, ajustes y ayuda
  ui/views.js           bloqueo, onboarding y carga

  main.js               composición: licencia → sesión → bucle → UI
```

Reglas de dependencia: `ui → core`, `main → todas`, `sequencer → core`, `audio → core`,
`vision → core`. Nunca `core → ui` ni `vision → ui`.

## 3. Flujo de arranque

```
index.html
  └─ main.js
       ├─ loadSettings() / createLicenseManager()
       ├─ ¿licencia?  no → views.showLicense()  (QR | manual | demo)
       │                sí → views.showOnboarding()
       ├─ "Iniciar sesión musical" (gesto obligatorio)
       │    └─ startSession('camera' | 'simulator')
       │         ├─ cámara: getUserMedia → <video>
       │         ├─ simulador: canvas 640×480
       │         ├─ audio.init() + loadKit()
       │         ├─ createVisionEngine().start()
       │         ├─ createScheduler() + transport
       │         └─ bucle rAF: visión 20 fps + overlay
       └─ service worker (shell offline)
```

- **Cámara:** `startSession` pide `getUserMedia` y pinta el `<video>` en el overlay.
- **Simulador:** el mismo `createVisionEngine` consume el canvas sintético; `calibrateOnce()`
  calibra sin depender del rAF y después se siembran los bloques demo.
- **Demo:** `sessionStorage['mt.demo']` con vencimiento a 20 minutos; `features().camera` es
  `false`, así que solo habilita el simulador.

## 4. Contratos

### 4.1 `createTransport({ bpm, columns, sweepBeats })`

Matemática pura. Modela la posición como una recta:

```
total(t)  = anchorTotal + (t - anchorTime) / sweepDuration
boundaryAt(t) = total(t) * columns
timeOfBoundary(N) = anchorTime + (N / columns - anchorTotal) * sweepDuration
```

- `setBpm(next, now)` y `setColumns(next, now)` reanclan `(t, total)` en `now`: la posición no
  salta y la numeración de fronteras sigue siendo continua.
- `start(now)` reinicia en el inicio del barrido.
- `progressAt`, `columnAt`, `nextBoundaryAfter`, `passAt` son derivadas.

### 4.2 `createScheduler({ transport, onStep, clock, lookahead })`

- `start({ at, reset })`, `stop()`, `resync()`, `setBpm()`, `setColumns()`, `setLookahead()`.
- Cada tick programa todas las fronteras con `time <= now + lookahead`.
- Las notas con `time < now - 0.25` se descartan (pestaña dormida) para no disparar ráfagas.
- `onStep({ boundary, column, pass, time })`; el tiempo es el del reloj de audio.

### 4.3 `createVisionEngine({ source, columns, sensitivity, fps })`

- `process(now)` devuelve `null` si aún no toca frame; si no:
  `{ blocks, stats, calibrating? }`.
- `calibrate({ frames, timeoutMs })` promedia N frames (cámara, mesa vacía).
- `calibrateOnce()` calibra con un frame (simulador, sin rAF).
- `recalibrateFast()` marca la siguiente iteración para estimar el desplazamiento y mover el
  fondo (HU-04). No toca el transporte.
- `setSensitivity`, `setColumns`, `setFps`, `dispose()`.
- `blocks`: `[{ id, column, x, y, color, shape, confidence }]`, con `x` en 0..1.

### 4.4 `createAudioEngine()`

- `init()` crea/reanuda el `AudioContext` (solo tras un gesto del usuario).
- `loadKit(kitId)` sintetiza y cachea los samples que falten.
- `playColor(color, { when, y, column, columns, gain })` agenda una voz.
- `click(when)` metrónomo; `setVolume`, `setMuted`, `setMapping`, `suspend`, `dispose`.
- Tope de **48 voces** simultáneas; las voces se liberan en `ended`.

### 4.5 Servidor de licencias

`createLicenseStore({ file, pepper })`:

| Operación | Resultado |
| --- | --- |
| `createTokens(n, label)` | tokens en claro (una vez) + hashes persistidos |
| `redeem(token, deviceId)` | `200` licencia, `404 unknown_token`, `409 already_redeemed`, `400 malformed_token` |
| `verify(token, deviceId)` | `200`, `404`, `409 not_redeemed/already_redeemed`, `400` |
| `stats()` | `{ total, redeemed, available }` |

- Solo se guarda `SHA-256(pepper:token)`; el JSON no permite reutilizar códigos.
- Las escrituras se serializan en una cola y el archivo se reemplaza con `rename` atómico.
- `deviceId` se genera en el cliente y se guarda en `localStorage`; el canje lo vincula.

HTTP (`server/app.mjs`):

```
GET  /api/health                → { ok, total, redeemed, available }
POST /api/license/redeem        → { token, deviceId }
POST /api/license/verify        → { token, deviceId }
```

Rate limit: 30 POST/minuto por IP. Cuerpo máximo: 8 KiB. Cabeceras CSP, `nosniff`,
`frame-ancestors 'none'` y `permissions-policy: camera=(self)`.

## 5. Pipeline de visión

```
video/canvas
  → recorte central "cover" a 320×240
  → background: luma + cromaticidad normalizada
  → mask: umbral dinámico (ruido) + histéresis (entrar/salir)
  → morphology: apertura (quita píxeles sueltos) + cierre (rellena huecos)
  → components: BFS 8-conectado, área mínima/máxima, fill
  → layers: color por fila + agrupación en bandas verticales
  → columns: confirmación por hits + TTL + una entrada por color
  → main.handleStep: al cruzar la columna, dispara todos los colores
```

- **Color:** se clasifica por cromaticidad, no por brillo, para tolerar cambios de luz.
- **Capas:** una torre es un solo blob; las bandas contiguas del mismo color se fusionan y las
  bandas finas (bordes/transiciones) se absorben en la vecina mayor.
- **Columnas:** `confirmHits = 2` evita falsos positivos de un frame; `ttlMs = 340` evita cortes
  por parpadeos de detección.
- **Alineación:** perfiles de luma por fila/columna + correlación normalizada. Devuelve la
  traslación del contenido y `shiftBackground` mueve el modelo, no la cámara.

## 6. Invariantes y dónde se garantizan

| Invariante | Implementación |
| --- | --- |
| La música no se detiene al recalibrar (HU-04) | `recalibrateFast` solo marca `pendingAlign`; el scheduler no se toca. |
| La música no se detiene al cambiar BPM (HU-07) | `transport.setBpm` reancla sin reiniciar; el scheduler sigue con la misma frontera. |
| El reloj es `AudioContext.currentTime` | `createScheduler({ clock: () => audio.currentTime })`. |
| Ningún frame sale del dispositivo | No hay `fetch` de imagen; CSP `connect-src 'self'`. |
| Sin licencia no hay audio | `startSession` no se llama sin licencia; `audio.init()` solo dentro de la sesión. |
| Polifonía por columna | `columnModel.active()` agrupa por columna y `handleStep` recorre todas las entradas. |

## 7. Rendimiento y memoria

- Visión a **20 fps** sobre 320×240 (~76 800 píxeles); el frame se recorta antes de procesar.
- Buffers de fondo, máscara, morfología, etiquetado y capas se crean una vez por sesión.
- Un único `requestAnimationFrame` para visión + overlay; sin `setInterval` de render.
- El scheduler usa `setTimeout` de 25 ms solo como despertador.
- `dispose()`/`stop()` en cámara, motor de visión, overlay, audio y scheduler al cambiar de vista.
- Los samples se sintetizan una vez y se cachean por `sampleId` + tasa de reproducción.

## 8. Privacidad y seguridad

- El video nunca se sube; el QR se decodifica en el cliente.
- El servidor no guarda tokens en claro ni datos personales; solo hashes, etiqueta de lote,
  fechas y `deviceId`.
- El desbloqueo local es copiable por diseño (offline). La defensa real es el canje único y la
  verificación por dispositivo en el servidor.
- CSP estricta (`default-src 'self'`), `frame-ancestors 'none'`, `nosniff`, rate limit y cuerpo
  máximo.

## 9. Deuda y límites conocidos

- **Cámara real:** el camino `getUserMedia` no se validó en hardware dentro de este entorno; la
  lógica de visión sí está cubierta por pruebas sintéticas. Ver [QA.md](QA.md).
- **Latencia:** 20 fps + lookahead de 120 ms; el disparo puede adelantarse hasta 120 ms.
- **Calibración con cámara:** depende del rAF; si la pestaña está oculta, el timeout se extiende
  pero no calibra hasta que vuelva a ser visible.
- **Service worker:** cache-first con revalidación; hay que subir `VERSION` en cada release.
- **Samples personalizados:** el MVP usa síntesis; no hay carga de archivos del profesor.
