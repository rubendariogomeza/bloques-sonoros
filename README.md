# Bloques Sonoros · Secuenciador musical tangible

PWA educativa en la que los bloques físicos colocados sobre una mesa se convierten en música.
La cámara detecta los bloques, una línea de lectura barre la mesa de izquierda a derecha y cada
columna hace sonar sus colores al mismo tiempo (polifonía vertical). Todo el video y el audio se
procesan en el navegador: **ningún frame sale del dispositivo**.

- **Profesor:** calibra el fondo, elige kit de sonidos, ajusta BPM, sensibilidad y volumen.
- **Alumnos:** mueven y apilan bloques. El único feedback es el sonido.
- **Acceso:** código QR de un solo uso impreso en el manual del kit físico; se canjea una vez
  contra el servidor y queda activo en el dispositivo para siempre (incluso sin internet).

## Arranque rápido

Requisitos: **Node ≥ 20**. No hay `npm install`, ni bundler, ni frameworks.

```sh
node server/index.mjs      # o: npm start
# http://localhost:4173
```

La primera vez el inventario está vacío y el servidor imprime un código de prueba:

```
  Código: MT-XXXX-XXXX-XXXX-C
```

Escríbelo o escanéalo en la pantalla de bloqueo. Si prefieres no gastar un código:

1. Pulsa **Probar con bloques virtuales** (demo de 20 minutos, solo simulador).
2. O pulsa **Empezar con bloques virtuales** en el onboarding tras activar un kit.

El simulador dibuja una mesa de madera con bloques y atraviesa exactamente el mismo pipeline de
visión que la cámara (fondo, máscara, morfología, blobs, capas, columnas).

## Comandos

| Comando | Para qué |
| --- | --- |
| `npm start` | App + API de licencias en `http://localhost:4173`. |
| `npm test` | Suite completa (`node --test`, 55 pruebas). |
| `npm run tokens -- --count 25 --label lote-septiembre` | Genera códigos de un solo uso. |
| `npm run tokens -- --count 5 --out server/data/lote.txt` | Los guarda en un archivo para imprimir. |

Variables de entorno del servidor:

| Variable | Por defecto | Nota |
| --- | --- | --- |
| `PORT` | `4173` | |
| `HOST` | `0.0.0.0` | |
| `MT_PEPPER` | valor de desarrollo | **Obligatorio en producción**: firma los hashes del inventario. |

## Cómo se usa (profesor)

1. **Activa el kit** con el QR del manual (o escribe el código).
2. **Inicia sesión musical**: un toque que pide cámara y audio. Sin ese gesto el navegador no
   deja arrancar el motor de audio.
3. **Calibra** con la mesa vacía. La app aprende el fondo.
4. Coloca bloques. La línea de barrido los cruza y suena la columna completa.
5. Si la cámara se mueve, **⟳ Recalibrar rápido** compensa el desplazamiento sin parar la música.
6. **Sonidos** reasigna color → sample; **Ajustes** cambia rejilla (8/12/16/24), sensibilidad,
   latencia, volumen, metrónomo y fuente de video.

## Estructura

```
app/                 PWA estática (ES modules nativos, sin build)
  index.html         shell
  manifest.webmanifest
  sw.js              precache del shell para uso offline
  vendor/jsqr.js     lector QR offline (Apache-2.0)
  src/core/          config y utilidades puras
  src/platform/      localStorage
  src/auth/          token, API, licencia, escáner QR
  src/vision/        cámara → máscara → blobs → capas → columnas
  src/sequencer/     transporte (matemática pura) + scheduler (lookahead)
  src/audio/         samples sintetizados, kits y motor de voces
  src/ui/            overlay, HUD, dock, hojas y pantallas
server/              estático + API de licencias (solo stdlib)
test/                pruebas de lógica pura (node --test)
docs/                manifiesto, arquitectura, backlog, decisiones, QA y UX
```

## Cómo funciona (resumen)

1. **Visión (20 fps):** el frame se reduce a 320 px de ancho, se compara con un modelo de fondo
   por píxel (luma + cromaticidad normalizada), se umbraliza con histéresis y se limpia con
   morfología 3×3. Los blobs se etiquetan por conectividad 8 y se descomponen en capas de color.
2. **Iluminación:** un factor global estimado por histograma corrige la exposición; el fondo
   guarda reflectancia, no brillo.
3. **Recalibración en caliente:** se estima la traslación de la cámara con los perfiles de
   luminancia y se desplaza el modelo de fondo. Los bloques siguen sobre la mesa.
4. **Tiempo:** el transporte es una recta anclada a `AudioContext.currentTime`; el scheduler
   programa con 120 ms de lookahead (1,6 s en segundo plano). Cambiar BPM reancla sin saltar.
5. **Audio:** cada sample se sintetiza una vez con `OfflineAudioContext` y se reproduce con
   `AudioBufferSourceNode`; 48 voces simultáneas como máximo.
6. **Licencia:** el servidor guarda solo `SHA-256(pepper:token)`, canjea de forma atómica y
   vincula el código al `deviceId` local.

## Despliegue

- La cámara exige **contexto seguro**: HTTPS o `localhost`.
- Sirve `app/` detrás del mismo origen que `/api/*` (el cliente usa rutas relativas).
- Define `MT_PEPPER` y haz copia de `server/data/licenses.json`.
- **Sube `VERSION` en `app/sw.js`** en cada despliegue: el service worker es cache-first y
  revalida en segundo plano, así que la primera carga tras publicar muestra la versión anterior.
- Sin backend, la app sigue funcionando offline con la licencia ya guardada; el canje inicial
  y la verificación necesitan red.

## Límites conocidos

- El desbloqueo vive en el cliente: se puede copiar `localStorage`. La autoridad real es el
  servidor, que impide canjear dos veces el mismo código.
- Detección a 20 fps: entre ~100 y ~300 ms entre mover un bloque y oírlo, según el equipo.
- El disparo se resuelve al programar la nota (hasta 120 ms antes del cruce visual).
- La calibración con cámara requiere que la pestaña esté visible (usa `requestAnimationFrame`).
- `BarcodeDetector` no existe en todos los navegadores; hay respaldo `jsQR` y entrada manual.

## Documentación

- [Manifiesto del producto](docs/PROJECT_MANIFESTO.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Backlog y estado de las historias](docs/BACKLOG.md)
- [Decisiones](docs/DECISIONS.md)
- [QA y riesgos](docs/QA.md)
- [UX y sistema visual](docs/UX.md)

## Licencia

Código del proyecto: uso privado. `app/vendor/jsqr.js` se distribuye bajo Apache-2.0 (ver el
encabezado del archivo).
