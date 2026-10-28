# Bloques Sonoros · Secuenciador musical tangible

PWA educativa en la que los bloques físicos colocados sobre una pared se convierten en música.
La escena se divide en una **parrilla de 8 filas**: una línea de lectura barre el área de
izquierda a derecha y, al cruzar cada bloque, suena el instrumento de su color en la nota de su
fila. Una pared vacía es silencio total y cualquier combinación cae en la pentatónica de Do, así
que el niño compone sin poder desafinar. La melodía reactiva a la forma de la estructura, el
**retrato sonoro** (una cara → una canción) y el modo bloque → sonido siguen disponibles como
alternativas. Todo el video y el audio se procesan en el navegador: **ningún frame sale del
dispositivo**.

- **Profesor:** calibra el fondo, elige modo de juego y kit de sonidos, ajusta BPM, sensibilidad
  y volumen.
- **Alumnos:** construyen y apilan bloques. El único feedback es el sonido.
- **Acceso:** código QR de un solo uso impreso en el manual del kit físico; se canjea una vez
  contra el servidor y queda activo en el dispositivo para siempre (incluso sin internet).
  Para pruebas con los cubos reales existe el **modo prueba**, que omite el QR (ver abajo).
- **Montaje:** soporte impreso en 3D con el móvil en horizontal, cámara frontal a la pared.

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

El simulador dibuja una pared con bloques y atraviesa exactamente el mismo pipeline de visión que
la cámara (fondo, máscara, morfología, parrilla, silueta, blobs, capas, columnas). Al mover los
bloques, cada cuadro suena con su instrumento y su nota; en modo melodía, la forma cambia el
registro, la densidad o el instrumento en el compás siguiente. En modo **Retrato** el simulador
cambia a una escena con una cara sintética: tocar la escena pasa a la siguiente cara y cada una
tiene su propia canción.

## Modo prueba (sin QR)

Para probar con el kit físico sin gastar un código, `app/src/core/config.js` exporta
`TEST_MODE = true`. Con ese valor:

- No aparece la pantalla de licencia: la app abre directo en el onboarding.
- La cámara queda habilitada sin canje ni vencimiento y se muestra la insignia **Modo prueba**.
- «Volver al inicio de la prueba» reinicia la sesión sin borrar nada del dispositivo.

Es un interruptor de desarrollo: ponlo en `false` para producción y el bloqueo por QR vuelve a
funcionar exactamente igual que antes (la lógica de licencia no se modificó).

Para enviar el enlace a otra persona, el servidor tiene que ser accesible por HTTPS (la cámara lo
exige). En local se puede abrir un túnel temporal:

```sh
tools/cloudflared.exe tunnel --url http://localhost:4173 --no-autoupdate --protocol http2
```

El enlace `trycloudflare.com` vive solo mientras sigan corriendo el servidor y el túnel; al
cerrarlos deja de responder. Para un enlace estable hay un despliegue permanente en GitHub Pages:

**https://rubendariogomeza.github.io/bloques-sonoros/**

Se actualiza con cada push a `main` y no depende de ninguna computadora encendida. Detalles en
[DEPLOY.md](docs/DEPLOY.md).

## Comandos

| Comando | Para qué |
| --- | --- |
| `npm start` | App + API de licencias en `http://localhost:4173`. |
| `npm test` | Suite completa (`node --test`, 129 pruebas). |
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
3. **Calibra** con la pared vacía. La app aprende el fondo.
4. Construye con bloques. La línea de barrido recorre el área: cada bloque suena con el
   instrumento de su color y la nota de su fila (modo **Parrilla**, el modo de fábrica). En **Melodía**,
   la forma de la estructura cambia la variación en el compás siguiente (el chip del HUD dice cuál).
   En **Retrato**, la cara más grande elige la canción y los gestos la modulan; sin cara no suena
   nada.
5. Si la cámara se mueve, **⟳ Recalibrar rápido** compensa el desplazamiento sin parar la música.
6. **Sonidos** reasigna color → sample (en parrilla, solo instrumentos afinados); **Ajustes** cambia
   modo de juego, rejilla (8/12/16/24), sensibilidad, latencia, volumen, metrónomo y acentos.

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
  src/vision/        cámara → máscara → parrilla/silueta/cara → blobs → capas → columnas
  src/sequencer/     transporte (matemática pura) + scheduler (lookahead)
  src/music/         canción pentatónica, silueta → variación, fila → nota y rostro → canción
  src/audio/         samples sintetizados, kits, motor de voces y melodía
  src/ui/            overlay, HUD, dock, hojas y pantallas
server/              estático + API de licencias (solo stdlib)
test/                pruebas de lógica pura (node --test)
docs/                manifiesto, arquitectura, backlog, decisiones, QA y UX
```

## Cómo funciona (resumen)

1. **Visión (20 fps):** el frame se reduce a 320 px de ancho, se compara con un modelo de fondo
   por píxel (luma + cromaticidad + saturación), se umbraliza con histéresis y se limpia con
   morfología 3×3. Sobre la máscara se mide la **parrilla** (ocupación y color dominante por
   cuadro), la **silueta** (ocupación, altura, base, color, simetría) o la **cara** (piel YCbCr ∩
   primer plano); los blobs se reservan para el HUD y los destellos.
2. **Iluminación:** un factor global estimado por histograma corrige la exposición; el fondo
   guarda reflectancia, no brillo. Las sombras (mismo matiz, más oscuras) se descartan.
3. **Recalibración en caliente:** se estima la traslación de la cámara con los perfiles de
   luminancia y se desplaza el modelo de fondo. Los bloques siguen sobre la pared.
4. **Música:** en **Parrilla** (por defecto), el color de cada cuadro elige un instrumento afinado
   y su fila un grado pentatónico con la escalera centrada en la nota natural del timbre; sin
   bloques no hay notas. En **Melodía**, una melodía pentatónica en Do con progresión I–V–vi–IV:
   la silueta elige registro, densidad, timbre, bajo y adorno, y el cambio se aplica al empezar el
   compás tras 0,9 s de forma estable. En **Retrato**, la cara más grande elige una canción propia
   (registro, densidad, timbre, bajo, adorno y contorno) y los gestos la modulan al empezar el
   compás; sin cara no hay música. Toda nota pertenece a la escala o al acorde: no puede
   desafinar.
5. **Tiempo:** el transporte es una recta anclada a `AudioContext.currentTime`; el scheduler
   programa con 120 ms de lookahead (1,6 s en segundo plano). Cambiar BPM reancla sin saltar.
6. **Audio:** cada sample se sintetiza una vez con `OfflineAudioContext` y se reproduce con
   `AudioBufferSourceNode`; la melodía se afina con `playbackRate`. 48 voces como máximo.
7. **Licencia:** el servidor guarda solo `SHA-256(pepper:token)`, canjea de forma atómica y
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
- La música depende de la **silueta** en modo melodía, no de contar piezas: apilar bloques del
  mismo color no añade notas, cambia el registro o la densidad de la canción.
- En **Parrilla** un bloque ancho suena una vez por columna y una torre del mismo color suena una
  sola nota; el contraste con la pared importa (blanco sobre blanco puede no detectarse).
- Las piezas que se tocan se fusionan en un solo blob; es intencionado (ver `docs/DECISIONS.md`).
- En **Retrato** solo se sigue la cara más grande, sin estimación de pose: un perfil muy girado
  puede no detectarse y entonces no suena nada (no hay melodía de fondo). La firma del rostro es
  efímera: vive en memoria y se borra al cerrar la sesión.
- El registro más grave de la marimba suena apagado; pendiente de ajuste de timbre.

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
