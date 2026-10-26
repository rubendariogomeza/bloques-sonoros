# UX y sistema visual

> El profesor opera la app; los niños solo mueven bloques. La interfaz existe para que el adulto
> pueda **arrancar, calibrar y corregir** sin robar atención al juego. El feedback principal del
> niño es el sonido, no la pantalla.

## 1. Principios

1. **El sonido es la interfaz del niño.** La pantalla no debe pedirle atención ni recompensas
   visuales que compitan con la mesa.
2. **Un toque para lo importante.** Entrar, calibrar y pausar están siempre a un toque.
3. **Nada detiene la música.** Recalibrar, cambiar BPM, rejilla o kit se hace en caliente.
4. **La cámara es el fondo, no un panel.** Los controles flotan sobre el video y se apartan.
5. **Errores en español y accionables.** Cada error dice qué pasó y qué tocar después.
6. **Privacidad visible.** El onboarding explica que el video se procesa en el dispositivo.
7. **Accesible por defecto.** Foco visible, objetivos de 48 px, teclado y movimiento reducido.

## 2. Las dos audiencias

| | Profesor | Niño |
| --- | --- | --- |
| Objetivo | Que la clase suene y se pueda corregir | Que su bloque suene cuando pasa la línea |
| Atención | Puede mirar la pantalla | Mira y toca la mesa |
| Control | Dock, hojas, calibración | Bloques físicos (o virtuales en demo) |
| Feedback | HUD, banners, toasts, cajas de detección | Sonido, destello de columna |
| Errores | Mensajes con acción siguiente | Ninguno: si un bloque no suena, el profesor ajusta |

## 3. Flujo del profesor

```
Abrir la URL
   │
   ├─ Sin licencia → PANTALLA DE BLOQUEO
   │     ├─ Escanear QR del manual ──┐
   │     ├─ Escribir el código ──────┤→ canje en el servidor → licencia local
   │     └─ Probar con bloques virtuales → demo 20 min (solo simulador)
   │
   └─ Con licencia → ONBOARDING
         ├─ Iniciar sesión musical → permisos de cámara + audio → SESIÓN
         ├─ Empezar con bloques virtuales → SESIÓN (simulador)
         └─ Usar otro kit → vuelve al bloqueo
               │
               ▼
        SESIÓN EN VIVO
         ├─ Calibrar (pared vacía) → banner de confirmación
         ├─ Construir con bloques → la línea barre y cada cuadro suena
         │    (parrilla: color = instrumento, fila = nota; pared vacía = silencio)
         ├─ En modo melodía, la forma de la estructura cambia la variación en el compás siguiente
         ├─ ⟳ Recalibrar rápido (sin cortar la música)
         ├─ Sonidos → kit + color → sample (o instrumentos afinados en parrilla)
         ├─ Ajustes → modo de juego, rejilla, sensibilidad, latencia, volumen, acentos
         └─ Desactivar este kit → vuelve al bloqueo
```

Tiempo objetivo del primer arranque: **< 5 minutos** desde la URL hasta el primer sonido.

## 4. Pantallas

### 4.1 Carga (`boot`)

- Fondo oscuro con el patrón de la escena y la tarjeta “Preparando el aula · Un momento…”.
- El chrome del profesor (HUD y dock) está oculto mientras `data-view="boot"` o `"locked"`.

### 4.2 Bloqueo por licencia (`locked`)

| Elemento | Contenido |
| --- | --- |
| Marca | “Bloques Sonoros · Secuenciador musical tangible” |
| Título | “Desbloquea tu kit” |
| Texto | “Escanea el código QR impreso en el manual para activar el motor musical en este dispositivo.” |
| Acción primaria | **Escanear el QR del manual** |
| Acciones secundarias | **Escribir el código**, **Probar con bloques virtuales** |
| Letra pequeña | “Un código activa una instalación. Después funciona sin internet.” |

Estados:

- **Escáner:** video en vivo con marco animado, estado (“Pidiendo permiso…”, “Buscando el QR…”),
  **Cancelar** y **Subir una foto**. Si la cámara falla, el error queda dentro del panel.
- **Código manual:** campo `MT-XXXX-XXXX-XXXX-C`, **Activar kit**, **Volver**. El checksum local
  detecta erratas antes de llamar al servidor; el foco vuelve al campo tras un error.
- **Demo:** insignia “Prueba · 20 min”, sin cámara; al vencer, vuelve al bloqueo con el motivo.

### 4.3 Onboarding (`kit` y `demo`)

| Elemento | Kit | Demo |
| --- | --- | --- |
| Insignia | “Kit activado” | “Prueba · 20 min” |
| Título | “Vamos a sonar” | “Todo listo para probar” |
| Acción primaria | **Iniciar sesión musical** | **Entrar con bloques virtuales** |
| Secundarias | **Empezar con bloques virtuales**, **Usar otro kit** | **Usar otro kit** |

Tres permisos explicados en lista, no en un muro de texto:

1. **Cámara** — “El video se procesa aquí y nunca se sube a internet.”
2. **Sonido** — “El navegador lo pedirá al primer toque. Sube el volumen.”
3. **Pared despejada** — “Deja la pared vacía y toca Calibrar una sola vez.”

Consejo al pie: “Coloca el móvil en el soporte del kit, en horizontal y mirando a la pared.”
El botón primario se deshabilita mientras arranca y muestra “Preparando…”.

### 4.4 Sesión en vivo (`live`)

- **Escena:** video a pantalla completa (o mesa sintética) con la línea de barrido.
- **HUD superior:** marca, estado, BPM, número de celdas o bloques, **variación vigente**, FPS
  opcional y fuente (`Cámara`/`Virtual`). En parrilla el contador dice «Celdas».
- **Chip de variación:** texto corto que describe lo que está sonando ahora mismo
  (`Melodía base`, `marimba · agudo · corcheas · bajo`). Solo aparece en el modo melodía.
- **Dock inferior:** reproducción, tempo, calibrar, recalibrar, sonidos, ajustes y silencio.
- **Banner contextual:** aparece bajo el HUD; en errores no se autocierra.
- **Toasts:** confirmaciones breves (1,2–4,2 s) en la esquina inferior, `role="status"`.

Estados del chip:

| Estado | Cuándo | Color |
| --- | --- | --- |
| Sin sesión | No hay sesión activa | Rojo |
| Calibrando | Capturando el fondo | Ámbar |
| Sin calibrar | Hay video pero falta el fondo | Ámbar |
| En vivo | El scheduler está corriendo | Verde |
| En pausa | Hay fondo pero el transporte está detenido | Ámbar |

### 4.5 Hoja **Sonidos** (HU-10/HU-14)

- Título “Sonidos de los bloques” o “Sonidos de la parrilla” según el modo.
- **Kit:** tres tarjetas (nombre + descripción) con `aria-pressed`. En parrilla no hay tarjetas:
  el kit es fijo y afinado.
- **Color → sonido:** una fila por color con muestra, nombre y `select` de 18 samples. En parrilla
  el `select` solo ofrece los 10 instrumentos con altura definida.
- Ayuda: “En los kits melódicos, la altura del bloque también elige la nota.”
- **Restablecer kit** vuelve al mapeo por defecto.
- Cada cambio se aplica al instante y se confirma con un toast; se persiste con debounce.

### 4.6 Hoja **Ajustes**

| Control | Rango | Ayuda |
| --- | --- | --- |
| Modo de juego | Parrilla / Melodía / Bloques | “Parrilla: cada cuadro suena con el instrumento de su color; pared vacía, silencio. Melodía: la forma de la estructura cambia la canción. Bloques: cada color dispara su sonido.” |
| Rejilla del compás | 8 / 12 / 16 / 24 | “8 es más fácil de leer; 24 da más detalle.” |
| Sensibilidad | 0–100 % | Subir si los bloques claros no se ven; bajar si hay sombras que suenan |
| Compensación de cámara | 0–300 ms | Alinea lo que se ve con lo que suena |
| Volumen | 0–100 % | — |
| Clic de referencia | Sí/No | Pulso al inicio de cada barrido |
| Acentos de los bloques | Sí/No | Solo en melodía: un toque suave al cruzar un bloque, siempre dentro de la escala |
| Mostrar rendimiento | Sí/No | FPS y ms por frame |
| Fuente de video | Cámara / Bloques virtuales | La cámara se deshabilita en demo |
| Calibración | **Calibrar con la pared vacía**, **Recalibrar rápido** | La rápida no detiene la música |
| Salir | **Desactivar este kit** / **Salir de la prueba** | Rojo, acción destructiva |

Pie: “Bloques Sonoros v0.1.0 · El video nunca sale de este dispositivo.”

### 4.7 Hoja **Cómo se juega**

Cuatro pasos numerados: colocar el móvil en el soporte frente a la pared, calibrar con la pared
vacía, construir con los bloques y recalibrar si la cámara se mueve. Cierre **Entendido**. Se abre
desde Ajustes para no añadir ruido al dock.

### 4.8 Cómo cambia la música en modo melodía (HU-12)

La app no asigna una nota a cada bloque: siempre suena una melodía infantil en Do, y la **forma**
de la construcción la varía. Esto evita el caos con muchas piezas y garantiza que nada desafine.
Este comportamiento es el del modo **Melodía**; en **Parrilla** cada cuadro sí tiene su nota.

| Lo que hace el niño | Lo que se oye |
| --- | --- |
| Construye alto | La melodía sube de octava |
| Cubre más pared | El ritmo pasa de negras a corcheas o semicorcheas |
| Usa otro color dominante | Cambia el instrumento solista (marimba, campana, pizzicato) |
| Extiende una base ancha | Entra el bajo y una tercera paralela |
| Hace una forma irregular o muy llena | Aparece un arpegio de cierre o un trino |

- El cambio se aplica **al empezar el compás**, no a mitad de nota.
- Solo se confirma si la forma se mantiene **0,9 s**; mover un bloque no reescribe la canción.
- El chip del HUD dice qué está sonando; si el profesor cambia a **Bloques**, vuelve el
  modo bloque → sonido clásico.

### 4.9 Parrilla (HU-14, modo por defecto)

La escena se divide en **8 filas** invisibles; cada columna del compás es un paso. El niño coloca
un bloque y, al pasar la línea, suena el instrumento de su color en la nota de su fila.

| Lo que hace el niño | Lo que se oye |
| --- | --- |
| No deja nada en la pared | Silencio total: ninguna celda activa |
| Pone un bloque rojo | El timbre del rojo, en la nota de esa fila |
| Lo sube o lo baja | El mismo timbre, más agudo o más grave, sin salir de la escala |
| Apila dos colores | Los dos instrumentos a la vez |
| Pone un bloque a caballo entre dos filas | Una sola nota (la fila con más ocupación) |

- Las celdas ocupadas se tiñen con su color y el HUD cuenta **Celdas**.
- La fila 0 (arriba) es la más aguda; la 7 (abajo), la más grave. La escalera se centra en la nota
  natural de cada instrumento, así el bajo nunca suena chillón ni la campana grave.
- Cualquier combinación cae en la pentatónica de Do: no hay forma de desafinar.
- El profesor puede reasignar color → instrumento en **Sonidos**, pero solo entre timbres afinados.

## 5. Anatomía de la escena

```
┌──────────────────────────────────────────────┐
│ HUD: marca · estado · BPM · celdas · variación   │  ← chips translúcidos
│                                              │
│   ┊        ┊        ┊        ┊        ┊      │  ← rejilla de columnas (punteada)
│   ┊   ▢    ┊        ┊   ▢    ┊        ┊      │  ← cajas de detección por color
│   ┊        ┊        ┊   ▢    ┊        ┊      │  ← celdas teñidas + filas (parrilla)
│   ┊        ┊   ████████████████     ┊      │  ← banda de la columna activa
│   ┊        ┊        ┊   ┃        ┊        ┊  │  ← línea de barrido + estela
│                                              │
│   [▶] [− 96 +] [====]      [Calibrar] [⟳]…  │  ← dock del profesor
└──────────────────────────────────────────────┘
```

- La rejilla va del 14 % al 94 % de la altura para no chocar con HUD ni dock.
- En **Parrilla** se añaden 8 filas tenues: las celdas ocupadas se tiñen con su color y las que
  van a sonar se marcan con un contorno; el HUD cuenta «Celdas».
- La línea de barrido es ámbar (`--accent`), 2,5 px, con estela de 180 px y un punto brillante.
- La columna que suena se ilumina con una banda cálida translúcida.
- Cada bloque detectado se dibuja con el color real del kit y un halo suave.
- Al cruzar, la columna emite un destello radial de 420 ms (desactivado con movimiento reducido).
- La viñeta superior e inferior mejora el contraste del HUD y del dock sobre video claro.
- Sin frame (aún sin cámara) se muestra una rejilla tenue como marcador de posición.

## 6. Sistema visual

### 6.1 Tokens

| Token | Valor | Uso |
| --- | --- | --- |
| `--bg` | `#0c0a12` | Fondo profundo |
| `--bg-soft` | `#14111d` | Superficies secundarias |
| `--surface` | `rgba(28,24,40,.78)` | HUD, dock, chips |
| `--surface-strong` | `rgba(38,32,54,.94)` | Banners y hojas |
| `--text` | `#f6f3ff` | Texto principal |
| `--text-soft` | 68 % | Texto secundario |
| `--accent` | `#ffd166` | Barrido, acción primaria, foco |
| `--accent-ink` | `#241a00` | Texto sobre ámbar |
| `--violet` | `#8b7bff` | Estado activo / pausa |
| `--green` | `#34d399` | Éxito, “En vivo” |
| `--red` | `#fb7185` | Error, acción destructiva |
| `--radius-sm` | 10 px | Chips pequeños |
| `--radius` | 16 px | Tarjetas y banners |
| `--radius-lg` | 26 px | Hojas |
| `--tap` | 48 px | Objetivo táctil mínimo |
| `--safe-top/bottom` | `env(safe-area-inset-*)` | Notch y barra gestual |

Tipografía: `ui-sans-serif, system-ui, …`; HUD en mayúsculas 0,82 rem con tracking; botones
0,95 rem/600; títulos de tarjeta con `clamp()`; textos de ayuda al 68 % de opacidad.

### 6.2 Paleta de bloques

Los 10 colores del kit tienen nombre y muestra; **nunca se usa solo el color** para comunicar:

| Color | Hex | Etiqueta |
| --- | --- | --- |
| Rojo | `#ef4444` | Rojo |
| Naranja | `#f97316` | Naranja |
| Amarillo | `#facc15` | Amarillo |
| Verde | `#22c55e` | Verde |
| Cian | `#06b6d4` | Cian |
| Azul | `#3b82f6` | Azul |
| Morado | `#8b5cf6` | Morado |
| Rosa | `#ec4899` | Magenta |
| Blanco | `#e5e7eb` | Blanco |
| Negro | `#1f2937` | Negro |

### 6.3 Componentes

- **Botones:** `btn` (48 px), variantes `--primary` (ámbar), `--ghost` (borde), `--text`,
  `--danger`, `--violet`, tamaños `--sm`, `--wide`, `--round`. `icon-btn` para ⟳, ±, ✕, 🔊.
- **Chips:** estado con punto luminoso; `--optional` se oculta en móvil; `--warn`, `--danger`,
  `--live`, `--hidden`.
- **Dock:** barra flotante de 22 px de radio, `backdrop-filter`, desplazamiento horizontal si no
  cabe; separador flexible entre reproducción/tempo y utilidades.
- **Hojas:** bottom sheet en móvil, tarjeta centrada en ≥ 900 px; cabecera con título y ✕, cuerpo
  con scroll y pie de acciones.
- **Formularios:** `input` y `select` de 48 px, etiquetas visibles o `aria-label`, foco ámbar.
- **Segmentado:** botones con `aria-pressed` para rejilla y fuente de video.
- **Interruptor:** checkbox nativo oculto + pista visual; etiqueta completa clicable.
- **Toasts:** texto breve, fondo translúcido, se retiran solos; no bloquean la escena.
- **Banner:** mensaje contextual centrado, con acción opcional (“Calibrar ahora”); los errores
  permanecen hasta que se resuelven.

## 7. Movimiento

| Movimiento | Duración | Propósito |
| --- | --- | --- |
| Barrido de lectura | Continuo, 4 pulsos | Marca el tempo y el punto de disparo |
| Estela y punto de la línea | Continuo | Legibilidad sobre video claro |
| Banda de columna activa | Continuo | Refuerza qué columna suena |
| Destello de columna | 420 ms | Confirma el disparo |
| Aparición de hojas | 260 ms | Orientación espacial |
| Fade del dock en reposo | 350 ms | Despeja la escena |
| Toast | 1,2–7 s | Confirmación sin interrumpir |

**Modo reposo:** tras 4,2 s sin interacción, el dock se atenúa al 28 % (sigue siendo accionable) y el
HUD baja al 25 % de opacidad. Cualquier toque, tecla, rueda o redimensionado lo recupera. El primer
toque sobre la escena solo despierta los controles: no coloca un bloque en el simulador.

**`prefers-reduced-motion`:** se eliminan animaciones y transiciones CSS, el marco del escáner deja
de recorrer y los destellos no se dibujan. El barrido **se mantiene** porque es el mecanismo del
producto, no decoración.

## 8. Accesibilidad

- **Teclado:** todos los controles son `<button>`, `<input>` o `<select>` nativos; orden de tabulación
  natural; `:focus-visible` con contorno ámbar de 3 px.
- **Hojas modales:** `role="dialog"`, `aria-modal="true"`, `aria-label`; el foco entra en ✕, queda
  atrapado con Tab/Shift+Tab y vuelve al control de origen al cerrar.
- **Escape** cierra la hoja; el clic en el fondo también.
- **Etiquetas:** los botones de icono tienen `aria-label` (“Recalibrar rápido”, “Silenciar”, …);
  los sliders tienen etiqueta y valor visible; los kits usan `aria-pressed`.
- **Estado dinámico:** los toasts viven en `role="status"` con `aria-live="polite"`; el HUD no
  interrumpe al lector.
- **Contraste:** texto claro sobre superficies oscuras; la viñeta asegura legibilidad sobre video.
- **Tamaño:** objetivos de 48 px; en ≤ 560 px se ocultan marca textual y chips opcionales, no
  acciones.
- **Zoom 200 %:** el dock se desplaza en horizontal; las hojas hacen scroll interno.
- **Idioma:** `lang="es"`; toda la copia en español.

## 9. Copy y tono

- Tuteo directo, frases cortas, sin tecnicismos: “Deja la pared vacía y toca Calibrar”.
- La app habla de **kit**, **bloques**, **pared**, **línea**, **melodía** y **sonidos**, no de
  “modelo de fondo”, “blob” ni “scheduler”.
- La variación se explica en positivo: “La forma de la torre cambia la canción”, nunca como una
  lista de parámetros técnicos.
- Los errores incluyen la salida: “No pudimos abrir la cámara. Revisa el permiso o usa bloques
  virtuales.”
- Las confirmaciones son específicas: “Rejilla de 8 pasos”, “Rojo → Chasquido”, “Fondo calibrado”.
- La privacidad se dice una vez, claro: “El video se procesa aquí y nunca se sube a internet.”

## 10. Errores y recuperación

| Situación | Mensaje | Recuperación |
| --- | --- | --- |
| Cámara denegada | “No pudimos abrir la cámara…” | Revisar permiso o **Bloques virtuales** |
| Sin calibración | “Primero calibra el fondo con la pared vacía.” | Banner con **Calibrar ahora** |
| Calibración fallida | “No pudimos calibrar: …” | Reintentar con la pared vacía |
| Demo vencida | “La prueba de 20 minutos terminó…” | **Activar kit** |
| Kit en otro dispositivo | “Este kit ya está activado en otro dispositivo…” | Código del manual o soporte |
| Código inválido | Error de checksum o “no existe” | El campo se selecciona para corregir |
| Cambio de kit fallido | “No pudimos cargar el kit.” | Se conserva el kit anterior |
| Versión nueva | “Versión nueva lista. Cierra y abre la app…” | Reabrir |

## 11. Responsive y PWA

- **Móvil vertical:** HUD compacto (sin marca textual ni chips opcionales), dock desplazable,
  hojas a pantalla completa con pie fijo.
- **Móvil horizontal / tablet:** la escena gana altura; el dock sigue centrado a `min(1080px, 100vw-24px)`.
- **Escritorio ≥ 900 px:** bloqueo, onboarding y hojas se centran como tarjetas.
- **Safe areas:** `env(safe-area-inset-*)` en HUD y dock; `viewport-fit=cover`.
- **PWA:** `manifest.webmanifest` con nombre “Bloques Sonoros”, orientación libre, `theme-color`
  `#0c0a12`; modo `standalone` sin barra del navegador.
- **Sin conexión:** el shell y los samples sintetizados funcionan offline; el canje inicial y la
  verificación necesitan red.

## 12. Validación de usabilidad

Objetivo: un profesor nuevo completa el flujo sin ayuda en **< 5 minutos**.

| Tarea | Métrica | Objetivo |
| --- | --- | --- |
| Activar el kit con el QR | Tiempo y errores | < 60 s, ≤ 1 error |
| Llegar al primer sonido | Tiempo desde la URL | < 5 min |
| Calibrar con la mesa vacía | Intentos | 1 intento |
| Cambiar BPM en marcha | ¿La música se corta? | Nunca |
| Recalibrar tras mover la cámara | ¿Se detiene el tempo? | Nunca |
| Encontrar “Silenciar” | Tiempo | < 10 s |
| Cambiar un sonido | Tiempo | < 30 s |

Pruebas pendientes con el kit físico: primera impresión del bloqueo, claridad del concepto
“columna = paso”, utilidad del destello para el profesor y comprensión del modo demo.
