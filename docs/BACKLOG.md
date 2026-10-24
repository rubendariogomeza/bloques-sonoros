# Backlog y estado

> Estado verificado el 24/10/2026. `npm test` → **55 pruebas, 0 fallos**.
> Leyenda: ✅ implementado y verificado · 🟡 implementado, pendiente de validación en hardware · ⛔ no empezado.

## Resumen

| Historia | Estado | Evidencia |
| --- | --- | --- |
| HU-01 Autenticación por QR físico | 🟡 | `auth/qr.js`, `auth/license.js`, `server/licenseStore.mjs`; 10 pruebas de servidor/token. Canje manual verificado en navegador. QR impreso pendiente. |
| HU-02 Onboarding y permisos | 🟡 | `ui/views.js`, `main.js`; verificado con simulador. Permiso real de cámara pendiente. |
| HU-03 Calibración por sustracción de fondo | ✅ | `vision/background.js` + pruebas de máscara/fondo; `calibrateOnce` verificado en simulador. |
| HU-04 Recalibración en caliente | ✅ | `vision/align.js`; 3 pruebas (traslación ±1 px, sin movimiento, desplazamiento del fondo). |
| HU-05 Tolerancia a la luz | ✅ | `background.js` (factor global + reflectancia); prueba con +28 % de luz. |
| HU-06 Barrido continuo | ✅ | `sequencer/transport.js`; pruebas de posición lineal, reinicio y 10 min sin drift. |
| HU-07 Cambio de BPM sin cortes | ✅ | `transport.setBpm` + `scheduler.setBpm`; 2 pruebas + verificación visual del HUD (96 → 140). |
| HU-08 Disparo por atributos físicos | ✅ | `vision/color.js`, `layers.js`, `columns.js`, `audio/kits.js`; pruebas de color, capas y mapeo. |
| HU-09 Polifonía por apilamiento | ✅ | `columns.active()` + `handleStep`; prueba de torre de 3 colores y tope de 48 voces. |
| HU-10 Mapeo de sonidos | ✅ | `ui/sheets.js` + `audio/engine.setMapping`; hoja verificada y persistencia en `mt.settings.v1`. |
| HU-11 Monitoreo visual | ✅ | `ui/overlay.js`; verificado en simulador (barrido, cajas, destellos). Cámara real pendiente. |

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
  fuente (`Virtual`) y FPS si se activa “Mostrar rendimiento”.

## Deuda priorizada

1. **Validar cámara real** (HU-01/02/03/04/11): ángulo, reflejos, luz solar, mesa de madera.
2. **Medir latencia extremo a extremo** en móviles de gama media y ajustar el valor por defecto de
   compensación (hoy 0 ms).
3. **QR impreso**: probar `BarcodeDetector` y `jsQR` con el código del manual a distintas
   distancias y con poca luz.
4. **PWA instalada**: revisar el modo `standalone`, orientación y safe areas en iOS.
5. **Accesibilidad**: recorrido completo con teclado y lector de pantalla en las hojas.
6. **Samples personalizados** (fuera del MVP): permitir subir archivos y guardarlos en IndexedDB.

## Definición de terminado (AGENTS.md)

- [x] `npm test` en verde (55/55), sin skips.
- [x] Historia verificable con `npm start` en menos de 5 minutos (simulador + licencia).
- [x] `docs/BACKLOG.md` con el estado real.
- [x] Sin `console.log` de depuración ni código muerto (se retiraron `bus.js`, `store.js`, `idb.js`
      y helpers sin uso).
- [x] Controles del profesor con `:focus-visible`, hojas con foco atrapado y
      `prefers-reduced-motion` respetado.
- [ ] Cámara real y QR impreso validados en hardware (requiere el kit físico).
