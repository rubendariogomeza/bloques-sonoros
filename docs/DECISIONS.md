# Decisiones

Registro de decisiones de arquitectura (ADR ligero). Cada una: contexto → decisión → consecuencia.

---

## ADR-01 · Stack sin build ni dependencias

**Contexto:** el producto se distribuye por URL y debe poder mantenerse en un aula sin toolchain.

**Decisión:** ES modules nativos, CSS plano, servidor Node con solo `stdlib` y `node --test`.
Única dependencia vendorizada: `app/vendor/jsqr.js` (Apache-2.0).

**Consecuencia:** cero `npm install`, despliegue = copiar la carpeta. A cambio, no hay
transpilación, minificación ni tipos; el navegador debe soportar módulos (todos los objetivos sí).

---

## ADR-02 · Visión por computadora propia

**Contexto:** OpenCV.js pesa varios MB y MediaPipe no ofrece sustracción de fondo genérica.

**Decisión:** pipeline propio: luma + cromaticidad normalizada, umbral dinámico con histéresis,
morfología 3×3 separable, etiquetado BFS 8-conectado y bandas de color verticales.

**Consecuencia:** control total del rendimiento y del tamaño; funciona offline sin descargas.
A cambio, hay que mantener y calibrar el algoritmo con hardware real.

---

## ADR-03 · Fondo con reflectancia y factor de luz global

**Contexto:** un cambio de luz de la habitación no debe convertir la mesa en “objetos” ni borrar
los bloques (HU-05).

**Decisión:** estimar un factor `light` por histograma de ratios de luma y guardar en el fondo
`rgba / light` (reflectancia). La comparación usa cromaticidad normalizada, invariante a brillo.

**Consecuencia:** la exposición se corrige en pocos frames y el fondo no se “quema”. El modelo
asume una fuente de luz aproximadamente global (no sombras duras localizadas).

---

## ADR-04 · Recalibración en caliente por traslación

**Contexto:** volver a fotografiar el fondo al mover la cámara borraría los bloques y, si se
detuviera el audio, rompería HU-04.

**Decisión:** estimar la traslación dominante con los perfiles de luma por fila/columna
(correlación normalizada) y desplazar el modelo de fondo. La música no se toca.

**Consecuencia:** tolera movimientos de la base sin reiniciar; no corrige rotación, zoom ni
cambios de perspectiva. Si el movimiento es grande, conviene recalibrar en frío.

---

## ADR-05 · Samples sintetizados en tiempo de ejecución

**Contexto:** licencias de samples, peso de assets y funcionamiento offline.

**Decisión:** sintetizar cada sample con `OfflineAudioContext` al cargar el kit y cachearlo en
memoria. Sin archivos de audio en el repositorio.

**Consecuencia:** cero assets y cero problemas de licencia; el primer `loadKit` tarda unos ms.
El timbre es sintético, no grabaciones reales.

---

## ADR-06 · Reloj de audio + lookahead

**Contexto:** `setInterval` deriva y se estrangula en segundo plano; el ritmo no puede fallar.

**Decisión:** el transporte es matemática pura; el scheduler despierta cada 25 ms y agenda
fronteras hasta `now + 120 ms` (1,6 s si la pestaña está oculta). El reloj es
`AudioContext.currentTime`.

**Consecuencia:** sin drift audible y sin ráfagas al volver de una pestaña dormida. El disparo
puede adelantarse hasta el lookahead; se compensa con el ajuste de latencia.

---

## ADR-07 · Fronteras absolutas y reanclaje al cambiar BPM

**Contexto:** cambiar el tempo no debe reiniciar la posición ni duplicar pasos (HU-07).

**Decisión:** numerar fronteras de forma absoluta (`boundary = total * columns`) y reanclar
`(tiempo, total)` en el instante del cambio. `nextBoundary` nunca retrocede.

**Consecuencia:** transición fluida y numeración continua. Las notas ya agendadas antes del
cambio conservan su tiempo original (hasta 120 ms de desfase transitorio).

---

## ADR-08 · Token con checksum y hash con pepper

**Contexto:** el código va impreso en un manual; hay que detectar erratas y evitar que una
filtración del inventario permita reutilizar códigos.

**Decisión:** formato `MT-XXXX-XXXX-XXXX-C` (12 caracteres Crockford base32 + control). El
servidor guarda solo `SHA-256(pepper:token)`, canjea de forma atómica y vincula el `deviceId`.

**Consecuencia:** el cliente detecta errores de tecleo sin red; el servidor es la autoridad. El
desbloqueo local es copiable, pero el código no se puede canjear dos veces.

---

## ADR-09 · Demo de 20 minutos solo con simulador

**Contexto:** profesores y QA necesitan probar sin gastar un código ni tener cámara.

**Decisión:** `sessionStorage['mt.demo']` con vencimiento a 20 minutos; `features().camera` es
`false` en demo. El simulador atraviesa el mismo pipeline de visión.

**Consecuencia:** se puede evaluar la app completa sin kit. La demo no permite cámara para no
regalar el producto; se pierde al cerrar la pestaña.

---

## ADR-10 · Un único bucle de render

**Contexto:** visión + overlay + HUD no deben competir por el hilo principal.

**Decisión:** un solo `requestAnimationFrame` en `main.js`; la visión procesa como máximo a
20 fps y el overlay dibuja cada frame. El scheduler vive fuera del rAF.

**Consecuencia:** menos jank y un solo punto de `dispose`. El overlay puede dibujar a 60 fps
aunque la visión vaya a 20.

---

## ADR-11 · Simulador como ciudadano de primera

**Contexto:** sin hardware no se puede desarrollar ni demostrar; los tests puros no cubren el
pipeline completo.

**Decisión:** `vision/simulator.js` implementa la misma interfaz que la cámara (`element`,
`kind`, `tick`, `setColumns`, `seedDemo`, `addBlock`, `removeAt`). Incluye deriva de luz.

**Consecuencia:** QA y demos funcionan en cualquier portátil; el código de visión no tiene ramas
“modo demo”.

---

## ADR-12 · Service worker cache-first con versión manual

**Contexto:** la app debe abrir sin red una vez cargada, pero los despliegues no pueden quedar
atrapados en una versión vieja.

**Decisión:** precache del shell en `bloques-shell-vN`; navegación network-first con respaldo en
caché; assets cache-first con revalidación en segundo plano. `VERSION` se sube a mano.

**Consecuencia:** offline inmediato y actualizaciones en la siguiente carga. Riesgo: olvidar
subir `VERSION` deja una versión anterior en la primera visita tras publicar.

---

## ADR-13 · Sin IndexedDB en el MVP

**Contexto:** se evaluó guardar samples personalizados del profesor en IndexedDB.

**Decisión:** posponerlo. El MVP usa síntesis y los ajustes caben en `localStorage`. Se retiró el
wrapper de IndexedDB para no mantener código muerto.

**Consecuencia:** menos superficie y menos fallos en navegación privada. Cargar samples propios
queda como extensión futura (HU-10 ampliada).

---

## ADR-14 · UI sin framework

**Contexto:** pocas vistas, mucho estado en tiempo real y necesidad de controlar el DOM.

**Decisión:** helpers propios (`el`, `clear`, `setText`) y render imperativo desde `main.js`.

**Consecuencia:** cero dependencias y control total del foco y del ARIA. A cambio, hay que
gestionar a mano el ciclo de vida de las vistas y los listeners.

---

## Descartado

| Idea | Motivo |
| --- | --- |
| OpenCV.js / MediaPipe | Peso, arranque y falta de sustracción de fondo configurable. |
| Detección por marcadores ArUco | Requiere imprimir marcadores; el kit usa bloques de color. |
| Backend con base de datos | El MVP solo necesita un JSON con hashes; menos infraestructura. |
| Web Worker para visión | El pipeline a 320×240 cabe en el hilo principal a 20 fps; añadir worker complica el overlay. |
| Audio por `<audio>` | Latencia y falta de control de polifonía; Web Audio es obligatorio. |
| Samples en archivos | Peso, licencias y cache; la síntesis cubre el MVP. |
