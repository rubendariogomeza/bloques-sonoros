# Backlog y estado

> Estado verificado el 25/10/2026. `node --test` → **113 pruebas, 0 fallos**.
> Leyenda: ✅ implementado y verificado · 🟡 implementado, pendiente de validación en hardware · ⛔ no empezado.

## Resumen

| Historia | Estado | Evidencia |
| --- | --- | --- |
| HU-01 Autenticación por QR físico | 🟡 | `auth/qr.js`, `auth/license.js`, `server/licenseStore.mjs`; 10 pruebas de servidor/token. Canje manual verificado en navegador. QR impreso pendiente. **Modo prueba** (`TEST_MODE` en `core/config.js`) permite probar con los cubos sin canjear código. |
| HU-02 Onboarding y permisos | 🟡 | `ui/views.js`, `main.js`; verificado con simulador. Permiso real de cámara pendiente. |
| HU-03 Calibración por sustracción de fondo | ✅ | `vision/background.js` + pruebas de máscara/fondo; `calibrateOnce` verificado en simulador. |
| HU-04 Recalibración en caliente | ✅ | `vision/align.js`; 3 pruebas (traslación ±1 px, sin movimiento, desplazamiento del fondo). |
| HU-05 Tolerancia a la luz | ✅ | `background.js` (factor global + reflectancia); prueba con +28 % de luz. |
| HU-06 Barrido continuo | ✅ | `sequencer/transport.js`; pruebas de posición lineal, reinicio y 10 min sin drift. |
| HU-07 Cambio de BPM sin cortes | ✅ | `transport.setBpm` + `scheduler.setBpm`; 2 pruebas + verificación visual del HUD (96 → 140). |
| HU-08 Disparo por atributos físicos | ✅ | `vision/color.js`, `layers.js`, `columns.js`, `audio/kits.js`; pruebas de color, capas y mapeo. Modo alternativo: Ajustes → Modo de juego → **Bloques**. |
| HU-09 Polifonía por apilamiento | ✅ | `columns.active()` + `handleStep`; prueba de torre de 3 colores y tope de 48 voces. Modo alternativo desde HU-12. |
| HU-10 Mapeo de sonidos | ✅ | `ui/sheets.js` + `audio/engine.setMapping`; hoja verificada y persistencia en `mt.settings.v1`. |
| HU-11 Monitoreo visual | ✅ | `ui/overlay.js`; verificado en simulador (barrido, cajas, destellos). Cámara real pendiente. |
| HU-12 Melodía reactiva a la silueta | ✅ | `vision/structure.js`, `music/variation.js`, `music/song.js`, `audio/melody.js`; 14 pruebas (silueta, variación, armonía exhaustiva, reproductor, timbres). Verificado en navegador: 34–94 notas/8–12 s, 0 notas fuera de escala. Los timbres se cargan aparte del kit: la melodía suena también con el kit de percusión por defecto. |
| HU-13 Montaje en pared con soporte 3D | 🟡 | Encuadre apaisado y rechazo de sombras (`vision/mask.js` + `test/vision-mask.test.js`). Falta validar con la pared y la luz del aula. |
| HU-14 Parrilla de color (modo por defecto) | ✅ | `vision/grid.js`, `music/grid.js`, kit `grid` en `audio/kits.js`; 16 pruebas de parrilla y altura + 4 de mapeo y máscara. Verificado en simulador: pared vacía en silencio, 10 colores activos, una nota por bloque y cambio de modo persistente. |

## Detalle

### HU-01 · Autenticación mediante código QR físico

- Pantalla de bloqueo si no hay licencia (`main.js` → `views.showLicense`).
- Tres vías: escanear con `BarcodeDetector`, respaldo `jsQR`, subir una foto o escribir el código.
- Formato `MT-XXXX-XXXX-XXXX-C` con checksum para detectar erratas antes de llamar al servidor.
- El servidor guarda solo `SHA-256(pepper:token)`, canjea una vez y vincula el `deviceId`.
- Tras el canje, la licencia queda en `localStorage` y la app funciona offline.
- **Pendiente:** probar con un QR impreso real y un lector de gama baja.

### HU-02 · Onboarding y desbloqueo de permisos

- El motor de audio no arranca hasta pulsar **Iniciar sesión musical** (gesto de usuario).
- La cámara se pide en ese momento; si falla, se muestra un error accionable y se puede seguir
  con bloques virtuales.
- **Pendiente:** validar el diálogo de permisos en iOS Safari y Android Chrome.

### HU-03 · Calibración del entorno

- `beginCalibration` + N frames promediados + `commitCalibration`.
- El primer frame ya deja un fondo provisional para dar feedback inmediato.
- En simulador, `calibrateOnce()` calibra con un frame y no depende del rAF.

### HU-04 · Recalibración en caliente

- `recalibrateFast()` marca `pendingAlign`; en el siguiente frame se estima la traslación con
  perfiles de luma (correlación normalizada) y se desplaza el fondo.
- No se vuelve a fotografiar el fondo: los bloques sobre la mesa siguen detectándose.
- El scheduler y el transporte no se tocan → el tempo continúa.

### HU-05 · Tolerancia a cambios de luz

- Histograma de ratios de luma → factor `light` global.
- El fondo guarda reflectancia (`rgba / light`), así que una subida de exposición no lo “quema”.
- Umbral dinámico según ruido medido; cromaticidad normalizada para separar color de brillo.

### HU-06 · Barrido de lectura

- `progressAt(t)` devuelve 0..1 y se reinicia al llegar a 1 (loop infinito).
- El overlay dibuja la línea y la banda de la columna activa.
- Prueba de 10 minutos simulados sin drift acumulado.

### HU-07 · Control de BPM

- Slider 50–190 BPM en el dock; `setBpm` reancla `(t, total)` sin reiniciar la posición.
- El scheduler recalcula la próxima frontera; no repite ni pierde pasos.
- Verificado en navegador: 96 → 140 con la música en marcha (HUD y persistencia).

### HU-08 · Detección y ejecución por atributos

- Color por cromaticidad; forma por relación de aspecto (`cube`, `tower`, `plank`).
- El kit mapea los 10 colores a samples; la altura elige la nota en kits melódicos.
- El disparo ocurre cuando la columna activa coincide con la columna del bloque.

### HU-09 · Polifonía vertical

- Una torre es un blob con varias bandas de color; `active()` devuelve todas las entradas de la
  columna y `handleStep` agenda todas en el mismo `when`.
- Tope de 48 voces; si se supera, la voz nueva se descarta (sin bloquear el audio).

### HU-10 · Mapeo personalizado

- Hoja **Sonidos**: 3 kits + selector por color con 18 samples.
- El cambio se aplica al motor al instante y se persiste (debounce 250 ms).
- **Restablecer kit** vuelve al mapeo por defecto.

### HU-11 · Monitoreo visual

- Overlay sobre el video: rejilla de columnas, línea de barrido con estela, cajas de detección
  por color, destellos al disparar y viñeta.
- HUD: estado (`En vivo`, `En pausa`, `Sin calibrar`, `Calibrando`), BPM, número de bloques,
  variación vigente (`marimba · agudo · corcheas · bajo`), fuente (`Virtual`) y FPS si se activa
  “Mostrar rendimiento”.

### HU-12 · Melodía reactiva a la silueta

- `structure.js` mide la silueta completa (ocupación por columna, altura, base, color dominante,
  simetría) sobre la máscara morfológica. No separa piezas: con el kit real los bloques se tocan.
- `variation.js` cuantiza la silueta en 5 dimensiones y exige 900 ms estable antes de confirmar.
- `song.js` renderiza un compás de melodía pentatónica (I–V–vi–IV) con lead, armonía y bajo.
- `melody.js` agenda las notas en el lookahead del scheduler y afina por `playbackRate`.
- La variación se aplica **solo en la columna 0**; el pulso y el BPM no se tocan (HU-06/07).
- Prueba exhaustiva: 162 variaciones × 8 compases sin una sola nota fuera de escala o acorde.
- Verificado en navegador: la estructura demo cambia el chip del HUD y la música sigue sonando
  al pasar de 100 a 140 BPM y al pausar/reanudar.

### HU-13 · Montaje en pared con soporte 3D

- El móvil va en horizontal con la cámara frontal a la pared; el pipeline recorta a 320×240 con
  encuadre «cover», así que no depende de la orientación del stream.
- `mask.js` rechaza sombras: mismo matiz que el fondo y luma entre 0,3 y 0,92 del original.
- La calibración se hace con la pared vacía; `recalibrateFast` mueve el fondo sin parar la música.
- **Pendiente:** validar distancia, ángulo del soporte y sombras reales del aula.

### HU-14 · Parrilla de color (modo por defecto)

- `grid.js` divide el frame en 16 columnas × 8 filas. Cada cuadro mide **ocupación** sobre la
  máscara calibrada y, solo dentro de lo ocupado, el **color dominante**: una pared vacía da
  `activeCount = 0` y no suena nada.
- `GRID_MIN_OCCUPANCY = 0,12`, confirmación de 2 frames y TTL de 340 ms; las filas contiguas del
  mismo color se colapsan para que un bloque entre dos filas suene una sola vez.
- `music/grid.js` traduce la fila a un grado pentatónico con la escalera centrada en la nota
  natural del instrumento (`gridMidi`): el bajo se queda grave y la campana aguda, siempre en Do.
- El kit **Parrilla** (`id: 'grid'`) tiene 10 timbres afinados y su propio mapeo
  (`settings.mappings.grid`), independiente del kit elegido. Solo admite instrumentos con altura.
- `playMode` (`grid | melody | blocks`) vive en `settings`, se cambia en **Ajustes** y el motor de
  visión solo ejecuta los analizadores del modo activo.
- La máscara gana un término de saturación (`0,5·dLuma + 0,45·dChroma + 0,55·dSat`) para que el
  rojo sobre madera se separe sin dejar de rechazar sombras (`dChroma < 0,028`).
- Verificado en simulador: 10 colores activos, `activeCount = 0` con la pared vacía, una nota por
  bloque, HUD «Celdas» y persistencia del modo y del mapeo.
- **Pendiente:** validar con el kit real el contraste de blanco sobre pared clara y negro sobre
  fondo oscuro.

## Deuda priorizada

1. **Validar cámara real** (HU-01/02/03/04/11/13/14): ángulo del soporte, reflejos, luz solar,
   sombras de manos y pared.
2. **Contraste de neutros en la parrilla:** el blanco sobre pared blanca y el negro sobre fondo
   oscuro pueden no alcanzar `GRID_MIN_OCCUPANCY`. Probar con el kit real y, si falla, subir la
   sensibilidad del color o excluir esos bloques del set.
3. **Estructuras muy grandes:** `maxArea = 45 %` en `engine.js` puede descartar una construcción
   que llene el encuadre. La silueta musical ya no depende de los blobs, pero el HUD y los
   destellos sí; conviene subir el límite o medir la silueta aparte.
4. **Registro grave apagado:** la marimba a `rate 0.5` suena opaca. Evaluar subir la melodía una
   octava o limitar `register` a medio/agudo.
5. **Medir latencia extremo a extremo** en móviles de gama media y ajustar el valor por defecto de
   compensación (hoy 0 ms).
6. **QR impreso**: probar `BarcodeDetector` y `jsQR` con el código del manual a distintas
   distancias y con poca luz.
7. **PWA instalada**: revisar el modo `standalone`, orientación y safe areas en iOS.
8. **Accesibilidad**: recorrido completo con teclado y lector de pantalla en las hojas.
9. **Samples personalizados** (fuera del MVP): permitir subir archivos y guardarlos en IndexedDB.

## Definición de terminado (AGENTS.md)

- [x] `node --test` en verde (113/113), sin skips.
- [x] Historia verificable con `npm start` en menos de 5 minutos (simulador + licencia).
- [x] `docs/BACKLOG.md` con el estado real.
- [x] Sin `console.log` de depuración ni código muerto (se retiraron `bus.js`, `store.js`, `idb.js`
      y helpers sin uso).
- [x] Controles del profesor con `:focus-visible`, hojas con foco atrapado y
      `prefers-reduced-motion` respetado.
- [ ] Cámara real y QR impreso validados en hardware (requiere el kit físico).
