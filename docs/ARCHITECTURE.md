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
  vision/mask.js        umbral dinámico, histéresis, cromaticidad, rechazo de sombras
  vision/morphology.js  apertura/cierre 3×3 separable
  vision/components.js  etiquetado 8-conectado, área, caja, fill
  vision/structure.js   silueta: ocupación por columna, altura, base, color dominante
  vision/layers.js      bandas de color verticales (torres)
  vision/columns.js     confirmación, TTL y estado musical por columna
  vision/grid.js        parrilla columnas × filas: ocupación y color dominante
  vision/face.js        piel YCbCr → cara más grande → firma efímera y gestos
  vision/align.js       estimación de traslación + desplazamiento del fondo
  vision/engine.js      orquesta el pipeline; sin rAF propio
  vision/camera.js      getUserMedia + ciclo de vida del stream
  vision/simulator.js   escena sintética (misma interfaz que la cámara)

  sequencer/transport.js  recta temporal, BPM, columnas, fronteras
  sequencer/scheduler.js  lookahead sobre el reloj de audio
  sequencer/pattern.js    escalas y altura → semitonos

  music/song.js         progresión, melodía pentatónica y variaciones por compás
  music/variation.js    silueta → variación (registro, densidad, timbre, bajo, adorno)
  music/portrait.js     semilla del rostro + gestos → variación y contorno
  music/grid.js         fila de la parrilla → nota pentatónica del instrumento

  audio/synth.js        síntesis offline de samples (sin assets)
  audio/kits.js         kits y mapeos color → sample
  audio/engine.js       AudioContext, voces, ganancia, mute
  audio/melody.js       agenda la melodía y los acentos en el lookahead

  ui/dom.js             helpers mínimos de DOM
  ui/overlay.js         video + rejilla + barrido + cajas + destellos
  ui/hud.js             chips de estado, banner y toasts
  ui/dock.js            controles del profesor
  ui/sheets.js          hojas de sonidos, ajustes y ayuda
  ui/views.js           bloqueo, onboarding y carga

  main.js               composición: licencia → sesión → bucle → UI
```

Reglas de dependencia: `ui → core`, `main → todas`, `sequencer → core`, `music → core`,
`audio → core`, `vision → core`. Nunca `core → ui` ni `vision → ui`. `music/` no importa
nada de `audio/` ni de `vision/`: recibe datos planos y devuelve notas.

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
  calibra sin depender del rAF y después se siembran los bloques demo. En modo Retrato el
  simulador cambia a la escena `face` (pared neutra + cara sintética) y recalibra con la escena
  vacía; tocar la escena pasa a la siguiente cara.
- **Demo:** `sessionStorage['mt.demo']` con vencimiento a 20 minutos; `features().camera` es
  `false`, así que solo habilita el simulador.
- **Modo Retrato:** el profesor acepta el aviso de privacidad (`settings.portraitConsent`) en
  Ajustes antes de activarlo. El motor de visión solo enciende el analizador `face` en ese modo y
  el audio reutiliza la paleta afinada de la melodía (`MELODY_SAMPLE_IDS`).

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
  `{ blocks, structure, stats, calibrating? }`.
- `structure` es la silueta medida sobre la máscara completa (no depende de separar piezas).
  Se reutiliza el mismo objeto en cada frame: no se debe retener entre frames.
- `calibrate({ frames, timeoutMs })` promedia N frames (cámara, pared vacía).
- `calibrateOnce()` calibra con un frame (simulador, sin rAF).
- `recalibrateFast()` marca la siguiente iteración para estimar el desplazamiento y mover el
  fondo (HU-04). No toca el transporte.
- `setSensitivity`, `setColumns`, `setFps`, `dispose()`.
- `blocks`: `[{ id, column, x, y, color, shape, confidence }]`, con `x` en 0..1.
- `structure`: `{ columns[{ fill, top, bottom, height, color }], colorWeights, dominantColor,
  coverage, mass, topHeight, baseWidth, symmetry, span, empty }`, todo normalizado 0..1.

### 4.4 `createStructureExtractor(width, height, columns)`

- `measure(binary, rgba)` recorre la máscara una vez y agrega por columna.
- `fill` = proporción de la columna ocupada; `top`/`bottom` en 0..1 (0 = borde superior).
- `mass` = media de `fill`; `topHeight` = media de `top` de las columnas ocupadas;
  `baseWidth` = fracción de columnas que llegan al 70 % inferior; `symmetry` = 1 − asimetría.
- `dominantColor` ignora blanco y negro si hay algún color saturado.
- El color se muestrea en una rejilla 2×2: suficiente para la silueta y barato por frame.

### 4.5 `createIntentTracker({ holdMs })` + `intentFromStructure(structure)`

- `intentFromStructure` cuantiza la silueta en cinco dimensiones discretas:
  `register` (0..2), `density` (0..2), `timbre` (0..2), `bass` (bool), `ornament` (0..2).
- La cuantización es la que evita que el ruido del detector reescriba la canción.
- `createIntentTracker` solo confirma una variación nueva si su `signature` se mantiene
  `holdMs` (900 ms) estable; `reset()` vuelve a la melodía base.
- `describeIntent(intent)` devuelve la etiqueta del HUD («campana · agudo · corcheas · bajo»).

### 4.6 `renderBar(bar, intent, { stepsPerBar })`

- Devuelve `[{ step, midi, gain, voice }]` con `voice` en `lead | harmony | bass`.
- La melodía son grados pentatónicos; el arpegio usa notas del acorde del compás.
- Invariante: toda nota pertenece a la pentatónica de Do o al acorde de su compás, para
  cualquier combinación de `intent` (cubierto por prueba exhaustiva).

### 4.7 `createAudioEngine()`

- `init()` crea/reanuda el `AudioContext` (solo tras un gesto del usuario).
- `loadKit(kitId)` sintetiza y cachea los samples que falten.
- `playColor(color, { when, y, column, columns, gain })` agenda una voz (modo bloque → sonido).
- `playNote(sampleId, { when, midi, gain, pan })` afina con `playbackRate` sobre
  `SAMPLE_BASE_MIDI`: una melodía sin renderizar un buffer por nota.
- `click(when)` metrónomo; `setVolume`, `setMuted`, `setMapping`, `suspend`, `dispose`.
- Tope de **48 voces** simultáneas; las voces se liberan en `ended`.

### 4.8 `createMelodyPlayer({ audio, stepsPerBar })`

- `beginBar({ bar, intent, stepsPerBar })` renderiza el compás al empezar el barrido.
- `playStep({ bar, step, intent, stepsPerBar, when })` agenda las notas de ese paso.
- `playAccent({ sampleId, column, columns, when })` toca un adorno pentatónico; si el sample
  no tiene altura definida, cae en el carillón.
- `reset()` al reiniciar el transporte.

### 4.9 Servidor de licencias

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

### 4.10 `createGridExtractor(width, height, opts)` + `gridMidi(baseMidi, row, rows)`

Modo **parrilla** (por defecto): el área visible se divide en `columns × GRID_ROWS`
(8 filas) y cada cuadro decide instrumento y nota.

- `measure(binary, rgba, now)` recorre la máscara morfológica una vez y devuelve
  `{ columns, rows, active, activeCount, coverage, cells }`. `cells` se reutiliza en cada frame.
- Cada celda: `{ index, column, row, occupancy, color, active, playing }`.
  `occupancy` = fracción del cuadro separada del fondo calibrado, suavizada con EMA 0,6.
- **Ocupación primero, color después:** el color se clasifica solo dentro de los píxeles
  ocupados. Una pared vacía deja `activeCount = 0`, así que no suena nada.
- `color` = color mayoritario del cuadro; blanco y negro ceden ante cualquier color saturado.
- `GRID_MIN_OCCUPANCY = 0.12`, `GRID_CONFIRM_HITS = 2`, `GRID_TTL_MS = 340`: dos frames
  seguidos para confirmar y 340 ms de gracia para que un parpadeo no corte la nota.
- `playing`: en cada tramo vertical contiguo del mismo color solo queda la celda con más
  ocupación. Un bloque que cruza la frontera de dos filas suena una sola vez.
- `reset()`, `setColumns()`, `setRows()` recalculan la rejilla sin allocations por frame.
- `gridMidi(baseMidi, row, rows, keyMidi)` devuelve la nota de la fila para un instrumento
  cuya nota natural es `baseMidi`: la escalera de 8 grados pentatónicos se centra en esa nota,
  así el bajo se queda grave y la campana aguda. `gridLadder` expone la escalera completa y
  `pentatonicMidi`/`degreeForMidi` convierten grado ↔ nota. Toda nota cae en la pentatónica de Do.

### 4.11 `createFaceExtractor(width, height, opts)` + `isSkin(r, g, b)`

Modo **retrato**: la cara más grande de la escena elige la canción.

- `measure(binary, rgba, now)` devuelve el objeto reutilizado `face` con
  `{ present, stale, x, y, w, h, cx, cy, area, fill, aspect, confidence, skin, hair, eyes, mouth,
  tilt, motion, cues, signature, seed }`, todo normalizado 0..1 salvo `seed` (0..1023).
- La máscara de piel (`isSkin`, YCbCr) se cruza con la máscara de primer plano; se etiqueta y se
  elige la componente mayor que pasa `minArea`, `maxArea`, `minFill` y `minAspect`/`maxAspect`.
- `eyes.line` se mide **relativo a la caja**; `mouth.open` sale del alto de la parte central de la
  boca y `mouth.smile` de cuánto suben las comisuras respecto al centro.
- `signature` = seis bins (`luma piel | Cr piel | pelo | proporción | línea de ojos | distancia
  interocular`); `seed` = FNV-1a de la firma `% 1024`. **No se guarda ni se envía nada.**
- `confirmHits = 2` para confirmar y `ttlMs = 300` para tolerar un parpadeo (`stale`).
- `cues` (`mouth`, `smile`, `eyes`, `tilt`, `motion`) se suavizan con EMA 0,35 para que la música
  no reaccione al ruido de un frame.
- `reset()` borra la cara y vuelve a `present = false`.

### 4.12 `intentFromPortrait(seed, cues)` + `createPortraitTracker({ holdMs })`

- `intentFromPortrait` reparte la semilla con una mezcla de bits (`mix`) en `register`,
  `density`, `timbre`, `bass`, `ornament` y `motif` (5 contornos pentatónicos), y aplica los gestos
  dentro de límites: `mouth > 0,55` → +1 densidad, `smile > 0,82` → adorno 2, `eyes < 0,22` →
  −1 registro, `|tilt| > 0,55` → otro contorno.
- Devuelve `{ register, density, timbre, bass, ornament, motif, seed, signature, portrait: true }`,
  compatible con `renderBar` y `createMelodyPlayer`.
- `createPortraitTracker` confirma un cambio de firma solo tras `holdMs` (900 ms) estable; la
  primera cara entra de inmediato. `describePortrait(intent)` alimenta el chip del HUD y devuelve
  «Retrato · esperando cara» cuando no hay nadie.
- `motifOffset(motif, index)` desplaza grados pentatónicos; `song.js` lo usa en melodía, eco, trino
  y armonía, así que todo contorno sigue dentro de la escala.

## 5. Pipeline de visión

```
video/canvas
  → recorte central "cover" a 320×240
  → background: luma + cromaticidad normalizada
  → mask: umbral dinámico (ruido) + histéresis (entrar/salir) + rechazo de sombras
  → morphology: apertura (quita píxeles sueltos) + cierre (rellena huecos)
  → grid: ocupación por cuadro + color dominante (modo parrilla)
  → face: piel ∩ primer plano → cara mayor → firma + gestos (modo retrato)
  → structure: silueta completa (ocupación, altura, base, color, simetría)
  → components: BFS 8-conectado, área mínima/máxima, fill
  → layers: color por fila + agrupación en bandas verticales
  → columns: confirmación por hits + TTL + una entrada por color
  → main: según playMode
       grid    → handleGridStep → gridMidi(color, row) → playNote
       portrait→ portraitTracker(semilla) → intent; handlePortraitStep → melodía + acentos
       melody  → intentTracker(silueta) → variación; handleStep → melodía + acentos
       blocks  → handleStep → playColor por columna
```

El motor solo ejecuta los analizadores que el modo necesita (`trackGrid`, `trackFace`,
`trackStructure`, `trackBlobs`), así que la parrilla no paga el costo de etiquetar piezas ni el
retrato el de medir la silueta.

- **Color:** se clasifica por cromaticidad, no por brillo, para tolerar cambios de luz. La
  diferencia de la máscara combina luma, cromaticidad y saturación
  (`0,5·dLuma + 0,45·dChroma + 0,55·dSat`) para que un bloque rojo sobre madera se separe.
- **Sombra:** si el píxel conserva la cromaticidad del fondo y solo es más oscuro (ratio
  0,3–0,92, `dChroma < 0,028`), no es un bloque. Sin esto, la sombra del móvil cambiaría la
  canción sola.
- **Silueta:** es la fuente de la variación musical. No intenta separar piezas: con el kit real
  los bloques se tocan y forman un único blob.
- **Capas:** una torre es un solo blob; las bandas contiguas del mismo color se fusionan y las
  bandas finas (bordes/transiciones) se absorben en la vecina mayor.
- **Columnas:** `confirmHits = 2` evita falsos positivos de un frame; `ttlMs = 340` evita cortes
  por parpadeos de detección.
- **Alineación:** perfiles de luma por fila/columna + correlación normalizada. Devuelve la
  traslación del contenido y `shiftBackground` mueve el modelo, no la cámara.

### 5.1 De la silueta a la música

```
structure ──► intentFromStructure ──► cuantización (5 dimensiones)
                                        │
                              intentTracker (900 ms estable)
                                        │
                            compás nuevo (columna 0) ──► renderBar
                                        │
                    ┌───────────────────┴────────────────────┐
                 melodía (lead/harmony/bass)            acentos por columna
```

| Silueta | Variación | Efecto audible |
| --- | --- | --- |
| `topHeight` bajo (estructura alta) | `register` 0/1/2 | una octava abajo / centro / arriba |
| `mass` (superficie ocupada) | `density` 0/1/2 | negras / corcheas / semicorcheas |
| `dominantColor` | `timbre` 0/1/2 | marimba / campana / pizzicato |
| `baseWidth` | `bass` | añade bajo y tercera paralela |
| `symmetry` / `mass` alto | `ornament` | arpegio de cierre o trino |

- La variación **solo se aplica al empezar el compás**, nunca a mitad de nota: el cambio se oye
  pero no rompe el pulso (HU-07 sigue intacto).
- `holdMs = 900` exige estabilidad: colocar un bloque no reescribe la canción al instante.
- Toda nota cae en la pentatónica de Do o en el acorde del compás, así que ninguna combinación
  desafina (prueba exhaustiva de 162 variaciones × 8 compases).
- Los acentos son un adorno: máximo dos por paso y solo en pasos pares, para no tapar la melodía.

### 5.2 De la parrilla a la música

```
frame ──► grid.measure ──► celdas activas ──► ¿columna del barrido?
                                              │ sí
                                   gridMidi(color, row, 8)
                                              │
                                   playNote(sample, { midi, gain, pan })
```

| Celda | Decisión | Efecto audible |
| --- | --- | --- |
| `occupancy` ≥ 0,12 | la celda existe | sin bloque no hay nota (silencio total) |
| `color` dominante | instrumento | 10 timbres afinados del kit **Parrilla** |
| `row` (0 arriba … 7 abajo) | grado pentatónico | escalera centrada en la nota natural del timbre |
| columna = frontera del barrido | momento | suena al pasar la línea, no antes |

- El color se mapea con `settings.mappings.grid` (independiente del kit elegido) y solo admite
  instrumentos con altura definida: un color no puede convertirse en bombo.
- Un bloque que ocupa varias columnas suena una vez por columna; una torre del mismo color suena
  como una sola nota (la celda con más ocupación) para no duplicar el mismo instrumento.
- Modos alternativos: **retrato** (HU-15, una cara → una canción), **melodía** (HU-12, variación
  por silueta) y **bloques** (HU-08/09, `playColor` por columna). `playMode` vive en `settings` y
  se cambia desde **Ajustes**.

### 5.3 De la cara a la música

```
frame ──► face.measure ──► piel ∩ primer plano ──► cara mayor
                              │
                   firma (6 bins) ──► semilla 0..1023
                              │
                    portraitTracker (900 ms estable)
                              │
                     gestos (boca, sonrisa, ojos, inclinación)
                              │
              compás nuevo (columna 0) ──► intentFromPortrait
                              │
                 melodía pentatónica + acentos de movimiento
```

| Rasgo del rostro | Dimensión | Efecto audible |
| --- | --- | --- |
| luma y Cr de la piel | semilla | registro, densidad, timbre, bajo y adorno propios |
| luma y cobertura del pelo | semilla | otra canción para otra persona |
| proporción de la caja | semilla | otra canción para otra persona |
| línea de ojos y distancia interocular | semilla | otra canción para otra persona |
| boca abierta (`cues.mouth > 0,55`) | densidad +1 | más notas por compás |
| sonrisa (`cues.smile`) | adorno | arpegio de cierre o trino |
| ojos cerrados (`cues.eyes < 0,22`) | registro −1 | una octava abajo |
| inclinación de la cabeza | contorno | otra forma melódica |
| movimiento (`cues.motion > 0,35`) | acentos | carillón suave en pasos pares |

- **Sin cara no hay música:** `handlePortraitStep` vuelve sin agendar nada si `face.present` es
  `false`. No se cae a la melodía base.
- La variación se congela al empezar el compás (`live.portraitIntent`); el gesto se sigue leyendo
  en cada frame, pero solo entra en el siguiente compás.
- La semilla es **efímera**: se pierde al cerrar la sesión y no se persiste en `localStorage`.
- El modo reutiliza `createMelodyPlayer` y `MELODY_SAMPLE_IDS`; el kit elegido no cambia el sonido
  de Retrato.


## 6. Invariantes y dónde se garantizan

| Invariante | Implementación |
| --- | --- |
| La música no se detiene al recalibrar (HU-04) | `recalibrateFast` solo marca `pendingAlign`; el scheduler no se toca. |
| La música no se detiene al cambiar BPM (HU-07) | `transport.setBpm` reancla sin reiniciar; el scheduler sigue con la misma frontera. |
| El reloj es `AudioContext.currentTime` | `createScheduler({ clock: () => audio.currentTime })`. |
| Ningún frame sale del dispositivo | No hay `fetch` de imagen; CSP `connect-src 'self'`. |
| Sin licencia no hay audio | `startSession` no se llama sin licencia; `audio.init()` solo dentro de la sesión. |
| La armonía nunca se rompe | `renderBar` solo emite pentatónica + notas del acorde; prueba exhaustiva de variaciones. |
| La variación no corta el pulso | Se aplica en `column === 0`, leyendo el `intentTracker` ya confirmado. |
| Polifonía por columna | `columnModel.active()` agrupa por columna y `handleStep` recorre todas las entradas. |
| La pared vacía no suena | `grid.measure` exige `occupancy ≥ 0,12` sobre la máscara calibrada; sin ocupación no hay celda activa. |
| La parrilla nunca desafina | `gridMidi` recorre grados de la pentatónica de Do centrados en la nota del instrumento. |
| Sin cara no suena nada (HU-15) | `handlePortraitStep` retorna antes de agendar si `face.present` es `false`. |
| La cara no se guarda ni se envía | La firma vive en el objeto `face` de la sesión: no se persiste en `localStorage` ni sale en ninguna petición. |
| El retrato nunca desafina | `intentFromPortrait` solo mueve dimensiones acotadas y `renderBar` filtra a pentatónica + acorde (1024 semillas × 2 gestos × 8 compases). |
| El gesto no corta el pulso | La instantánea se toma en `column === 0`; el gesto se lee en cada frame pero solo se aplica al empezar el compás. |

## 7. Rendimiento y memoria

- Visión a **20 fps** sobre 320×240 (~76 800 píxeles); el frame se recorta antes de procesar.
- Buffers de fondo, máscara, morfología, parrilla, etiquetado y capas se crean una vez por sesión.
- El motor solo ejecuta los analizadores del modo activo (`trackGrid`, `trackFace`,
  `trackStructure`, `trackBlobs`); la parrilla recorre la máscara una vez y reutiliza celdas e
  histogramas, y el retrato reutiliza la máscara de piel y el etiquetador.
- Un único `requestAnimationFrame` para visión + overlay; sin `setInterval` de render.
- El scheduler usa `setTimeout` de 25 ms solo como despertador.
- `dispose()`/`stop()` en cámara, motor de visión, overlay, audio y scheduler al cambiar de vista.
- Los samples se sintetizan una vez y se cachean por `sampleId` + tasa de reproducción.

## 8. Privacidad y seguridad

- El video nunca se sube; el QR se decodifica en el cliente.
- El modo Retrato no guarda ni envía caras: la firma es una semilla efímera en memoria y el
  consentimiento (`portraitConsent`) se pide antes de activarlo. Los tonos de piel se usan como
  señal numérica, nunca como categoría visible.
- El servidor no guarda tokens en claro ni datos personales; solo hashes, etiqueta de lote,
  fechas y `deviceId`.
- El desbloqueo local es copiable por diseño (offline). La defensa real es el canje único y la
  verificación por dispositivo en el servidor.
- CSP estricta (`default-src 'self'`), `frame-ancestors 'none'`, `nosniff`, rate limit y cuerpo
  máximo.

## 9. Deuda y límites conocidos

- **Kit real:** medido sobre metraje del kit. Los bloques se tocan y forman un solo blob, y la
  madera del fondo se clasifica como `orange`; por eso el modo melodía decide por **silueta** y no
  por piezas. Separar piezas queda descartado (ver DECISIONS.md). El modo parrilla no separa
  piezas: mide ocupación y color por cuadro.
- **Neutros en la parrilla:** blanco sobre pared blanca y negro sobre fondo oscuro pueden no
  alcanzar `GRID_MIN_OCCUPANCY`; falta validarlo con el kit real. Los colores saturados están
  cubiertos tras añadir el término de saturación a la máscara.
- **Cámara real:** el camino `getUserMedia` no se validó en hardware dentro de este entorno; la
  lógica de visión sí está cubierta por pruebas sintéticas. Ver [QA.md](QA.md).
- **Retrato:** la heurística es simple a propósito. `isSkin` puede aceptar madera o cartón poco
  saturados (la defensa real es la calibración del fondo), solo se sigue **una** cara (la mayor) y
  no hay estimación de pose: una cara girada o muy de perfil puede no detectarse. La calibración
  de umbrales de expresión está hecha sobre escenas sintéticas; falta medirla con caras reales.
  Los tonos de piel no se etiquetan, pero el detector tiene un rango YCbCr que conviene revisar con
  luz cálida y con piel muy oscura o muy clara.
- **Registro grave:** la marimba a `rate 0.5` (una octava abajo) suena apagada. Si el profesor
  lo nota, conviene subir la melodía una octava o limitar el registro a medio/agudo.
- **Latencia:** 20 fps + lookahead de 120 ms; el disparo puede adelantarse hasta 120 ms.
- **Calibración con cámara:** depende del rAF; si la pestaña está oculta, el timeout se extiende
  pero no calibra hasta que vuelva a ser visible.
- **Service worker:** cache-first con revalidación; hay que subir `VERSION` en cada release.
- **Samples personalizados:** el MVP usa síntesis; no hay carga de archivos del profesor.
