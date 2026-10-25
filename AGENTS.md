# AGENTS.md — Secuenciador Musical Tangible

PWA educativa: los bloques físicos sobre una mesa se convierten en música mediante visión
por computadora y Web Audio. Todo corre en el cliente.

## Fuente de verdad

| Documento | Contenido |
| --- | --- |
| `docs/PROJECT_MANIFESTO.md` | Visión, modelo de negocio, restricciones y HU-01…HU-11 |
| `docs/ARCHITECTURE.md` | Módulos, contratos y flujo de datos |
| `docs/BACKLOG.md` | Estado verificable de cada historia |
| `docs/DECISIONS.md` | Decisiones y descartes |
| `docs/QA.md` | Matriz de pruebas y riesgos |
| `docs/UX.md` | Flujo del profesor y sistema visual |

Si el código y el manifiesto discrepan, gana el manifiesto y se anota la deuda.

## Stack (no negociable)

- ES modules nativos, sin bundler, sin `npm install`, sin frameworks de UI.
- HTML + CSS + JS servidos tal cual por `server/index.mjs` (Node ≥ 20, solo stdlib).
- Node test runner (`node --test`) para la lógica pura.
- Única dependencia vendorizada: `app/vendor/jsqr.js` (Apache-2.0) para QR offline.

## Comandos

```sh
npm test          # suite completa (node --test)
npm start         # http://localhost:4173  (app + API de licencias)
npm run tokens    # genera códigos QR de un solo uso para el kit
```

## Mapa de módulos

```
app/src/core/       config, utilidades puras
app/src/platform/   localStorage
app/src/auth/       token, cliente API, licencia, escáner QR
app/src/vision/     cámara → máscara → silueta → blobs → capas → columnas
app/src/sequencer/  transporte (matemática pura) + scheduler (lookahead)
app/src/music/      canción pentatónica + silueta → variación armónica
app/src/audio/      sintetizador de samples, kits, motor de voces y melodía
app/src/ui/         vistas y render del overlay (solo presentación)
app/styles/         sistema de diseño CSS
test/               pruebas unitarias de lógica pura
server/             estático + API de canje de licencias
```

Reglas de dependencia: `ui → core`, `main → (todas)`, `sequencer → core`,
`music → core`, `audio → core`, `vision → core`. Nunca `core → ui` ni `vision → ui`.
`music/` no importa de `audio/` ni de `vision/`: recibe datos planos y devuelve notas.

## Convenciones de código

- JavaScript moderno, módulos con exports nombrados, sin clases innecesarias.
- Funciones puras para toda la matemática; efectos (DOM, audio, cámara) en el borde.
- Sin allocations en bucles por frame: buffers reutilizados, `Float32Array`/`Uint8Array`.
- Cada recurso tiene `dispose()`/`stop()`; ningún listener queda vivo tras cambiar de vista.
- Comentarios solo para decisiones no obvias (por qué, no qué). Nombres en inglés, textos de UI
  en español.
- Errores de cara al usuario en español y accionables.

## Invariantes del producto

1. La música no se detiene por recalibrar (HU-04) ni por cambiar BPM (HU-07).
2. El reloj es `AudioContext.currentTime`; `setTimeout` solo agenda con lookahead.
3. Ningún frame de video sale del dispositivo.
4. Sin licencia válida no se inicializa el motor de audio.
5. La melodía nunca desafina: toda nota pertenece a la pentatónica de Do o al acorde del compás.
6. La variación musical se aplica al empezar el compás, nunca a mitad de nota, y solo tras 0,9 s
   de silueta estable.
7. La polifonía es por columna (modo bloque → sonido): todos los bloques apilados suenan juntos.

## Definición de terminado

- `npm test` en verde y sin *skips* nuevos.
- Historia de usuario verificable con `npm start` en menos de 5 minutos.
- `docs/BACKLOG.md` actualizado con el estado real.
- Sin `console.log` de depuración ni código muerto.
- Accesible con teclado en los controles del profesor y respeta `prefers-reduced-motion`.
