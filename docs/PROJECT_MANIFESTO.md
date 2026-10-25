# BASE DE CONOCIMIENTO Y REQUERIMIENTOS: SECUENCIADOR MUSICAL TANGIBLE (PWA)
> **Tipo de documento:** Contexto de Sistema / Project Manifesto
> **Objetivo:** Proveer el contexto arquitectónico, funcional y de negocio para la ejecución del proyecto por parte de agentes autónomos.

---

## 1. CONTEXTO DEL PRODUCTO Y MODELO DE NEGOCIO

### 1.1. Visión General
El producto es un **secuenciador musical tangible e interactivo** diseñado para entornos educativos. Utiliza visión por computadora para transformar bloques físicos (cubos, paralelepípedos) dispuestos en una superficie (suelo/pared) en una composición musical en tiempo real. 
La aplicación es una PWA (Progressive Web App) distribuida a través de una URL, eliminando la necesidad de descargar software de tiendas de aplicaciones.

### 1.2. Modelo de Negocio
El acceso al software está anclado a la venta de un **kit físico** (bloques de madera/plástico y una base para el celular). La aplicación está protegida; los usuarios deben escanear un código QR único (de un solo uso) impreso en el manual del kit físico para desbloquear la PWA en su navegador de forma permanente.

### 1.3. Dinámica de Uso
*   **El profesor:** Opera la PWA, calibra la cámara (green screen/sustracción de fondo), escoge los kits de sonido (samples) y ajusta la velocidad (BPM).
*   **Los niños/alumnos:** Interactúan exclusivamente con el entorno físico, moviendo y apilando bloques sin mirar la pantalla. El feedback es puramente auditivo e instantáneo.

---

## 2. ARQUITECTURA TÉCNICA (RESTRICCIONES PARA LOS AGENTES)

1.  **Frontend & Procesamiento:** Todo el procesamiento de video (Computer Vision) y audio (Web Audio API) debe ocurrir en el **lado del cliente (Edge/Navegador)** para evitar latencia de red.
2.  **Visión por Computadora:** Se requiere el uso de librerías optimizadas para web (ej. OpenCV.js, MediaPipe). El método principal de detección es la **sustracción de fondo estático**.
3.  **Motor de Audio:** Uso estricto de la Web Audio API para manejar la polifonía, cargar *samples* en memoria y garantizar un *loop* secuencial sin desincronización (drift).
4.  **Distribución:** Debe construirse como una PWA instalable con capacidades *offline* una vez que los *samples* y dependencias han sido cacheados.

---

## 3. ROLES DEL EQUIPO (ASIGNACIÓN PARA EL ENJAMBRE)

*   **[ROLE: Product Owner]** Mantiene la visión de negocio, prioriza el backlog y asegura la integración de la validación del código QR físico.
*   **[ROLE: Arquitecto Frontend / Tech Lead]** Define el andamiaje de la PWA, gestión de estado y previene fugas de memoria (*memory leaks*) por el uso intensivo de hardware.
*   **[ROLE: Ingeniero de Computer Vision]** Diseña el algoritmo de sustracción de fondo, la recalibración en caliente y la tolerancia dinámica a la iluminación.
*   **[ROLE: Desarrollador Web Audio]** Construye el reloj musical (secuenciador), el mapeo espacial-a-tiempo y la polifonía vertical.
*   **[ROLE: UX/UI Designer]** Diseña la interfaz del profesor (controles superpuestos en la cámara) y el flujo de *onboarding* (permisos de hardware).
*   **[ROLE: QA Engineer]** Define los casos de prueba para hardware físico, latencia, cambios de luz en la habitación y falsos positivos en la cámara.

---

## 4. BACKLOG DEL MVP (HISTORIAS DE USUARIO)

### ÉPICA 1: SETUP Y SEGURIDAD
**HU-01: Autenticación mediante código QR físico**
*   *Como* cliente que recibe el kit físico, *Quiero* escanear un código QR único impreso en mi manual usando la app web, *Para* validar mi compra y desbloquear el motor musical.
*   **Criterios de Aceptación:**
    1. Mostrar pantalla de bloqueo si no hay sesión activa.
    2. Al enfocar el QR, leer el token y validarlo contra la base de datos de inventario.
    3. Si es válido, otorgar acceso local y quemar/marcar el código como consumido en el backend.

**HU-02: Onboarding y desbloqueo de permisos web**
*   *Como* profesor, *Quiero* ver una pantalla con el botón "Iniciar sesión musical", *Para* otorgar los permisos de cámara y audio requeridos por el navegador.
*   **Criterios de Aceptación:**
    1. Pausar flujos de video/audio al cargar la URL hasta que el usuario interactúe.
    2. Solicitar permisos de OS al presionar el botón e inicializar el motor solo tras la confirmación.

### ÉPICA 2: MOTOR DE VISIÓN Y CALIBRACIÓN
**HU-03: Calibración del entorno por sustracción de fondo**
*   *Como* profesor, *Quiero* capturar una imagen del área de juego vacía desde un soporte fijo, *Para* que la app detecte los bloques por diferencia visual (efecto green screen).
*   **Criterios de Aceptación:**
    1. Al presionar "Calibrar", tomar una foto y guardarla como fondo base.
    2. Aislar y seguir únicamente los objetos superpuestos tras la calibración.

**HU-04: Recalibración en caliente**
*   *Como* profesor, *Quiero* un botón de "Recalibrar rápido", *Para* reestablecer el fondo instantáneamente si la cámara se mueve por accidente sin detener la música.
*   **Criterios de Aceptación:**
    1. Al presionar el botón, actualizar la imagen de fondo de forma silenciosa.
    2. No interrumpir el barrido del secuenciador (el tempo se mantiene).

**HU-05: Tolerancia a cambios de iluminación**
*   *Como* sistema de detección, *Quiero* tener un algoritmo de umbral dinámico, *Para* seguir diferenciando los bloques del fondo original ante cambios graduales de luz.
*   **Criterios de Aceptación:**
    1. Ajustar el modelo de fondo internamente ante cambios progresivos de luz sin perder el rastro de las figuras.

### ÉPICA 3: CORE DE AUDIO E INTERACCIÓN
**HU-06: Barrido de lectura (El Loop)**
*   *Como* usuario, *Quiero* que una línea de lectura visual haga un barrido continuo de izquierda a derecha, *Para* establecer un compás musical constante e infinito.
*   **Criterios de Aceptación:**
    1. Trazar barrido virtual en el área activa.
    2. Reiniciar instantáneamente desde la izquierda al llegar al extremo derecho.

**HU-07: Control de velocidad del compás (BPM)**
*   *Como* profesor, *Quiero* ajustar la velocidad del barrido, *Para* adaptar el ritmo a la dinámica de la clase.
*   **Criterios de Aceptación:**
    1. Modificar la velocidad en tiempo real mediante un control en la interfaz.
    2. Transición fluida del ritmo sin reiniciar la posición actual de la línea.

**HU-08: Detección y ejecución por atributos físicos**
*   *Como* niño, *Quiero* que el sonido dependa de la forma y color del bloque, *Para* componer la percusión de la canción.
*   **Criterios de Aceptación:**
    1. Disparar el *sample* de audio mapeado cuando la línea de lectura intersecte las coordenadas del bloque.

**HU-09: Polifonía mediante apilamiento vertical**
*   *Como* usuario, *Quiero* apilar bloques formando torres, *Para* agrupar instrumentos y que suenen al mismo tiempo.
*   **Criterios de Aceptación:**
    1. Identificar múltiples bloques en el eje vertical (Y) sobre una misma coordenada horizontal (X).
    2. Reproducir simultáneamente todos los *samples* de esa columna sin latencia.

### ÉPICA 4: GESTIÓN DEL PROFESOR
**HU-10: Mapeo personalizado de sonidos (Kits)**
*   *Como* profesor, *Quiero* un menú para reasignar los sonidos de cada bloque, *Para* experimentar con texturas (ej. cambiar bombo por chasquido).
*   **Criterios de Aceptación:**
    1. Desplegar lista de *samples* al seleccionar un bloque en la UI.
    2. Aplicar el cambio inmediatamente en el motor de audio.

**HU-11: Monitoreo visual del sistema**
*   *Como* profesor, *Quiero* ver la cámara con la línea de barrido y feedback de detección, *Para* verificar el ritmo y la lectura correcta.
*   **Criterios de Aceptación:**
    1. Mostrar video en vivo con línea translúcida superpuesta.
    2. Generar destello visual en pantalla cuando la línea cruza y activa un bloque.

### ÉPICA 5: MELODÍA REACTIVA

> Revisión del 24/10/2026 tras probar el kit real: el mapeo bloque → sonido uno a uno produce
> caos con muchas piezas. La música pasa a ser una melodía continua que la **forma de la
> estructura** varía sin romper la armonía. HU-08 y HU-09 quedan como modo alternativo
> («bloque → sonido»), no como comportamiento por defecto.

**HU-12: Melodía que cambia de forma con la estructura**
*   *Como* niño, *Quiero* que al cambiar la forma de mi construcción la canción cambie de manera
    notable pero sin desafinar, *Para* sentir que compongo música sin necesidad de acertar notas.
*   **Criterios de Aceptación:**
    1. Suena una melodía infantil continua en una tonalidad fija, con acompañamiento armónico,
       desde el primer compás.
    2. La silueta de la estructura (altura, superficie ocupada, color dominante, base y simetría)
       elige una variación entre valores acotados: registro, densidad rítmica, instrumento,
       bajo y adorno.
    3. La variación se aplica al empezar un compás, nunca a mitad de nota, y solo si la silueta
       lleva al menos 0,9 s estable.
    4. Toda nota pertenece a la escala pentatónica o al acorde del compás: ninguna combinación
       de bloques puede sonar disonante.
    5. Cruzar un bloque produce un acento suave y afinado; el profesor puede desactivarlo.

**HU-13: Montaje en pared con soporte impreso en 3D**
*   *Como* profesor, *Quiero* colocar el móvil en horizontal frente a la pared donde construyen
    los niños, *Para* encuadrar la estructura completa sin pedirles que miren la pantalla.
*   **Criterios de Aceptación:**
    1. La app funciona con encuadre apaisado y frontal sobre una pared o un tablero vertical.
    2. Las sombras del móvil y de las manos no se detectan como bloques.
    3. La calibración se hace con la pared vacía y la recalibración rápida no corta la música.
