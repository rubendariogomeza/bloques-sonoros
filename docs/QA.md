# QA y riesgos

> Última corrida: **28/10/2026** · `node --test` → **129 pruebas, 129 pasan, 0 fallos, 0 omitidas**.
> Este documento distingue lo que está **probado de forma automática** de lo que **solo puede
> validarse con el kit físico**. No se marca como verificado nada que no se haya ejecutado.

## 1. Alcance

### Cubierto por la suite

- Matemática del secuenciador (BPM, columnas, fronteras, pausa, drift).
- Planificador con lookahead sobre un reloj simulado.
- Formato y checksum de tokens; canje y verificación de licencias.
- Servidor HTTP: archivos estáticos, cabeceras, traversal, rate limit, API de licencias.
- Pipeline de visión con frames sintéticos: fondo, luz, histéresis, morfología, blobs, capas,
  columnas, TTL, alineación por traslación y rechazo de sombras.
- Parrilla de color: ocupación por cuadro, color solo dentro de la máscara, confirmación/TTL,
  colapso de filas contiguas y reconstrucción al cambiar la rejilla.
- Silueta de la estructura (ocupación, altura, base, color dominante, simetría).
- Variación armónica: cuantización de la silueta, estabilidad de 900 ms y armonía de todas las
  combinaciones posibles.
- Reproductor de melodía: agenda en el lookahead, afinación por `playbackRate` y acentos.
- Mapeo color → sample y altura → semitono en los tres kits.
- Altura de la parrilla: toda fila cae en la pentatónica de Do y respeta la nota natural de cada
  instrumento.
- Retrato: piel YCbCr frente a bloques saturados y fondo azul, caja de la cara, confirmación y TTL,
  cara más grande, firma estable y gestos (boca, sonrisa, ojos), semilla → variación, estabilidad
  de 900 ms y armonía de las 1024 semillas.

### No cubierto por la suite (requiere navegador u hardware)

- `getUserMedia`, permisos reales del sistema operativo y cámaras de móvil.
- Salida de audio real (altavoces, Bluetooth, latencia percibida).
- Ciclo de vida del service worker, instalación PWA y modo offline.
- Lectura de un QR impreso con luz real.
- Caras reales en el modo Retrato: tono de piel con luz cálida, gestos finos, gafas y perfil.
- Lectores de pantalla, teclado físico y zoom del navegador.
- Comportamiento del servidor bajo carga real o tras un corte de energía.

## 2. Cómo ejecutar

```sh
node --test                 # suite completa (no usar node --test test/ en Node 24)
node server/index.mjs       # app + API en http://localhost:4173
node server/generate-tokens.mjs --count 5 --label lote-qa
```

- Las pruebas de servidor crean su inventario en un directorio temporal y escuchan en un puerto
  efímero (`127.0.0.1:0`). **No tocan `server/data/licenses.json`.**
- Para probar un canje desde cero en local, usa un perfil de navegador limpio o borra
  `localStorage['mt.license.v1']` y `localStorage['mt.device.v1']`.
- La cámara solo funciona en `localhost` o HTTPS (contexto seguro).

## 3. Matriz automatizada (129 pruebas)

### 3.1 Audio y tiempo — 28 pruebas

| Archivo | Prueba | Qué protege | HU |
| --- | --- | --- | --- |
| `audio-transport.test.js` | deriva la duración del barrido del BPM y del compás | 4 pulsos por barrido y duración correcta | HU-06/07 |
| | la posición avanza de forma lineal y reinicia al llegar al final | loop continuo sin saltos | HU-06 |
| | cambiar el BPM conserva la posición actual | la línea no salta al mover el tempo | HU-07 |
| | las fronteras siguen siendo continuas tras el cambio de tempo | no se duplican ni se pierden pasos | HU-07 |
| | 10 minutos simulados sin drift acumulado | el reloj no deriva | HU-06 |
| | cambiar columnas mantiene la posición y recalcula los pasos | rejilla 8/12/16/24 en caliente | HU-07 |
| `audio-scheduler.test.js` | programa pasos por delante del reloj de audio | lookahead de 120 ms | HU-06 |
| | el BPM nuevo no reinicia ni duplica pasos | cambio de tempo en marcha | HU-07 |
| | un salto de reloj no dispara una ráfaga de notas atrasadas | pestaña dormida | HU-06 |
| | pausa y reanudación conservan la numeración de pasos | reanudar sin repetir | HU-06 |
| | el lookahead ampliado cubre pestañas en segundo plano | 1,6 s en background | HU-06 |
| `audio-kits.test.js` | x normalizado cae siempre en una columna válida | mapeo espacial seguro | HU-08 |
| | arriba suena agudo y abajo grave | altura → nota | HU-08/09 |
| | los semitonos se convierten en factor de reproducción | transposición correcta | HU-08 |
| | todos los kits cubren los 10 colores con samples existentes | ningún color mudo | HU-08/10 |
| | la melodía carga sus timbres aunque el kit sea de percusión | la canción suena con el kit por defecto | HU-12 |
| | cada timbre de la melodía tiene altura de referencia | afinación sin buffers por nota | HU-12 |
| | sanitizeMapping rellena huecos y descarta ids inválidos | ajustes corruptos no rompen el audio | HU-10 |
| | el kit de la parrilla solo usa instrumentos afinados | ningún color puede volverse percusión | HU-14 |
| | sanitizePitchedMapping descarta percusión y rellena huecos | ajustes corruptos de la parrilla | HU-14 |
| `audio-melody.test.js` | afina con playbackRate sobre la nota real del sample | melodía sin un buffer por nota | HU-12 |
| | solo los samples con altura definida sirven de acento | percusión no desafina | HU-12 |
| | el acento sube de grave a agudo de izquierda a derecha | columna → altura | HU-12 |
| | el acento cae en la pentatónica con cualquier timbre | 5 timbres × 16 columnas en escala | HU-12 |
| | el reproductor agenda todas las notas del compás una sola vez | sin duplicados ni pérdidas | HU-12 |
| | el timbre y el bajo eligen el sample correcto | variación audible | HU-12 |
| | cambiar de compás recarga la melodía sin repetir notas | frontera de compás limpia | HU-12 |
| | un acento con sample no afinado cae en el carillón | respaldo seguro | HU-12 |

### 3.2 Licencias y servidor — 20 pruebas

| Archivo | Prueba | Qué protege | HU |
| --- | --- | --- | --- |
| `auth-token.test.js` | normaliza entrada humana con espacios y minúsculas | tecleo tolerante | HU-01 |
| | el checksum detecta errores de tecleo | errata antes de llamar al servidor | HU-01 |
| | los tokens generados son únicos y canónicos | inventario sin colisiones | HU-01 |
| | maskToken no filtra el código completo | logs y UI sin secretos | HU-01 |
| `server-store.test.js` | genera códigos válidos y solo persiste el hash | el JSON no permite reutilizar códigos | HU-01 |
| | el canje es de un solo uso por dispositivo | idempotencia del mismo dispositivo | HU-01 |
| | rechaza códigos inexistentes y mal formados | errores 404/400 | HU-01 |
| | verify solo acepta al dispositivo que canjeó | licencia atada al dispositivo | HU-01 |
| | los canjes concurrentes no queman dos veces el mismo código | cola de escritura atómica | HU-01 |
| `server-http.test.js` | sirve el shell con cabeceras de seguridad | CSP, nosniff, frame-ancestors | HU-01 |
| | sirve módulos y el vendor de QR con MIME correcto | ES modules y `jsQR` | HU-01 |
| | bloquea traversal de directorios | no se sale de `app/` | — |
| | health informa el inventario | operación y monitoreo | — |
| | el canje HTTP otorga licencia una sola vez por dispositivo | flujo completo | HU-01 |
| | verify responde al dispositivo correcto y rechaza al resto | revocación por dispositivo | HU-01 |
| | códigos inexistentes o mal formados no pasan | validación de entrada | HU-01 |
| | limita la tasa de peticiones de licencia | 30 POST/min por IP | — |

### 3.3 Visión — 49 pruebas

| Archivo | Prueba | Qué protege | HU |
| --- | --- | --- | --- |
| `vision-background.test.js` | un frame idéntico al fondo no produce primer plano | sin falsos positivos en reposo | HU-03 |
| | el primer frame de un cambio fuerte aún no confirma el bloque | histéresis de entrada | HU-03/05 |
| | un cambio global de luz se absorbe sin perder el bloque | +28 % de luz sin perder detección | HU-05 |
| | al retirar el bloque la máscara se apaga | el fondo no se “contamina” | HU-03 |
| `vision-align.test.js` | estima la traslación de la cámara con error de ±1 px | recalibración en caliente | HU-04 |
| | sin movimiento devuelve (0,0) | no desplaza el fondo sin motivo | HU-04 |
| | shiftBackground desplaza el modelo y replica bordes | bordes sin franjas falsas | HU-04 |
| `vision-columns.test.js` | una detección aislada no suena: hace falta confirmación | 2 frames antes de sonar | HU-08 |
| | el TTL mantiene el bloque vivo entre parpadeos y luego lo suelta | 340 ms de tolerancia | HU-08 |
| | una torre devuelve todos los colores de la misma columna | polifonía vertical | HU-09 |
| | columnas distintas conviven y se ordenan por altura | varias torres a la vez | HU-09 |
| | cambiar la rejilla reubica los bloques vivos | cambiar pasos en marcha | HU-07 |
| | clear vacía el estado musical | salir de la sesión sin residuos | — |
| `vision-grid.test.js` | pared vacía: ninguna celda activa ni sonando | silencio total sin bloques | HU-14 |
| | un bloque enciende su cuadro con el color correcto | color → instrumento | HU-14 |
| | el color se mide solo dentro de la máscara | la pared no dispara el instrumento blanco | HU-14 |
| | un bloque blanco también enciende su cuadro | neutros con contraste | HU-14 |
| | un cuadro deja de sonar si el bloque desaparece (TTL) | 340 ms de tolerancia | HU-14 |
| | un bloque que cruza dos filas del mismo color suena una vez | sin notas duplicadas | HU-14 |
| | dos colores distintos en filas contiguas suenan los dos | torre multicolor | HU-14 |
| | columnas distintas se siguen por separado | varias piezas a la vez | HU-14 |
| | cambiar columnas reconstruye la parrilla sin celdas fantasma | rejilla en caliente | HU-14 |
| `vision-layers.test.js` | una torre de tres colores produce tres capas ordenadas | descomposición vertical | HU-09 |
| | una banda fina de transición no crea un bloque fantasma | bordes y mezclas de color | HU-08 |
| | sin máscara suficiente cae al color del centro | bloques pequeños o lejanos | HU-08 |
| | la silueta distingue cubo, torre y tablón | forma por relación de aspecto | HU-08 |
| `vision-shapes.test.js` | la apertura elimina píxeles sueltos | ruido de cámara | HU-03 |
| | el cierre rellena huecos de un bloque | reflejos y brillos | HU-03 |
| | etiqueta dos componentes separadas con área y caja correctas | dos bloques próximos | HU-08 |
| | descarta blobs por debajo del área mínima | motas y sombras pequeñas | HU-03 |
| | conectividad en diagonal une una torre inclinada | torres mal apiladas | HU-09 |
| `vision-structure.test.js` | mide ocupación, altura y base de la silueta | la forma es la fuente de la variación | HU-12 |
| | elige el color dominante ignorando el fondo | timbre estable | HU-12 |
| | una pared vacía devuelve una silueta vacía | melodía base sin bloques | HU-12 |
| | reutiliza el objeto entre frames y respeta el cambio de rejilla | cero allocations y 8/12/16/24 | HU-12 |
| `vision-mask.test.js` | una sombra sobre la pared no es un bloque | sombra del móvil | HU-13 |
| | una sombra fuerte tampoco entra en la máscara | sombra de la mano | HU-13 |
| | un bloque oscuro sí es un bloque | no confundir negro con sombra | HU-13 |
| | un bloque de color se detecta aunque esté en penumbra | aula con poca luz | HU-13 |
| | un cambio global de luz se compensa con el factor de luz | deriva de exposición | HU-05 |
| | un bloque rojo sobre una mesa de madera no se confunde con el fondo | saturación en la diferencia | HU-14 |
| | la sombra de un bloque sobre madera sigue sin ser un bloque | el nuevo término no readmite sombras | HU-13 |
| `vision-face.test.js` | la piel se separa de los bloques saturados y del fondo azul | un cubo naranja no es una cara | HU-15 |
| | una cara se confirma tras dos frames y publica su caja | 2 frames y caja normalizada; ojos relativos a la caja | HU-15 |
| | la misma cara produce la misma firma y otra cara produce otra | semilla determinista por rostro | HU-15 |
| | sin primer plano no hay cara y el TTL la apaga | un parpadeo no corta la música | HU-15 |
| | la cara más grande gana cuando hay varias personas | solo se sigue a quien está más cerca | HU-15 |
| | boca abierta, sonrisa y ojos cerrados mueven sus señales de gesto | los gestos superan los umbrales de la música | HU-15 |
| | reset borra la cara y el gesto | salir del modo sin residuos | HU-15 |

### 3.4 Música — 32 pruebas

| Archivo | Prueba | Qué protege | HU |
| --- | --- | --- | --- |
| `music-song.test.js` | toda variación se queda dentro de la escala y del acorde | 810 variaciones × 8 compases sin disonancia | HU-12/15 |
| | la melodía base llena el compás y va ordenada | compás completo desde el inicio | HU-12 |
| | más densidad añade notas, no las quita | la variación es monótona | HU-12 |
| | el registro sube o baja la melodía una octava | cambio notable de altura | HU-12 |
| | el bajo solo suena con base ancha y toca la fundamental | bajo ligado a la forma | HU-12 |
| | el arpegio cierra el compás con notas del acorde | adorno consonante | HU-12 |
| | la rejilla de 8 pasos también cabe en el compás | 8/12/16/24 columnas | HU-12 |
| | los grados pentatónicos saltan de octava al pasar de La | aritmética de grados | HU-12 |
| `music-variation.test.js` | la pared vacía usa la melodía base | estado neutro | HU-12 |
| | la altura de la estructura elige el registro | silueta → música | HU-12 |
| | la densidad sale de la superficie ocupada | silueta → música | HU-12 |
| | el color dominante elige el timbre | silueta → música | HU-12 |
| | base ancha y forma irregular se oyen | bajo y adorno | HU-12 |
| | describeIntent resume la variación en una línea | texto del HUD | HU-12 |
| | la variación solo se aplica cuando la silueta se mantiene estable | 900 ms de histéresis | HU-12 |
| | un cambio fugaz no reescribe la canción | mover un bloque no cambia el compás | HU-12 |
| `music-grid.test.js` | toda nota de la escalera pertenece a la pentatónica de Do | la parrilla nunca desafina | HU-14 |
| | la fila 0 es la más aguda y la última la más grave | arriba agudo, abajo grave | HU-14 |
| | la fila central conserva la nota natural del instrumento | el bajo se queda grave | HU-14 |
| | pentatonicMidi recorre grados negativos sin salirse de la escala | octavas completas | HU-14 |
| | degreeForMidi y pentatonicMidi son coherentes en la pentatónica | ida y vuelta sin deriva | HU-14 |
| | la fila se recorta a los límites de la parrilla | índices fuera de rango | HU-14 |
| | la escalera funciona con cualquier número de filas | 4/8/12 filas | HU-14 |
| `music-portrait.test.js` | la misma semilla produce siempre la misma variación | canción estable por rostro | HU-15 |
| | las dimensiones quedan acotadas para cualquier semilla | 1024 semillas × 2 gestos sin desbordes | HU-15 |
| | semillas distintas reparten canciones distintas | más de 400 combinaciones y los 5 contornos | HU-15 |
| | los gestos cambian la música sin salirse de rango | boca, sonrisa, ojos e inclinación | HU-15 |
| | toda semilla y todo gesto se quedan en la pentatónica o en el acorde | 1024 × 2 × 8 compases sin disonancia | HU-15 |
| | el contorno 0 no desplaza la melodía base | el contorno es un adorno, no un cambio de tonalidad | HU-15 |
| | el tracker acepta la primera cara y exige estabilidad para cambiarla | 900 ms antes de reescribir la canción | HU-15 |
| | una firma que vuelve atrás cancela el candidato | el ruido del detector no confirma cambios | HU-15 |
| | el HUD describe el retrato o avisa de que no hay cara | «Retrato · esperando cara» sin nadie | HU-15 |

## 4. Matriz manual en navegador

Estados: ✅ verificado · 🟡 parcial · ⬜ pendiente.

| ID | Caso | Pasos | Resultado esperado | Estado |
| --- | --- | --- | --- | --- |
| M-01 | Activación manual | Escribir el código del servidor → **Activar kit** | Onboarding con insignia “Kit activado” | ✅ |
| M-02 | Código inválido | Escribir un código con checksum roto | Error en español, sin llamada al servidor | ✅ |
| M-03 | Código ya canjeado | Repetir el mismo código en otro perfil | “ya está activado en otro dispositivo” | 🟡 (cubierto por prueba HTTP; falta navegador) |
| M-04 | Demo | **Probar con bloques virtuales** | Onboarding demo, insignia “Prueba · 20 min” | ✅ |
| M-05 | Inicio en simulador | **Empezar con bloques virtuales** | Sesión viva, HUD “En vivo”, sin cámara | ✅ |
| M-06 | Calibrar mesa vacía | **Calibrar** en simulador | Banner “Fondo calibrado”, chip deja “Sin calibrar” | ✅ |
| M-07 | Añadir y quitar bloques | Tocar la escena / tocar un bloque | Aparece o se retira; HUD actualiza el contador | ✅ |
| M-08 | Patrón de ejemplo | **Bloques demo** | Patrón repartido en la rejilla actual | ✅ |
| M-09 | Cambio de BPM | Mover el slider 96 → 140 en marcha | El HUD cambia; la línea no se reinicia | ✅ |
| M-10 | Pausa y reanudación | ▶ / ❚❚ dos veces | El estado cambia sin perder la posición musical | ✅ |
| M-11 | Recalibrar rápido | ⟳ con la música en marcha | Aviso “sin cortar la música”; el tempo sigue | ✅ (simulador) |
| M-12 | Rejilla | Ajustes → 8 pasos | Aviso “Rejilla de 8 pasos”; los bloques se reubican | ✅ |
| M-13 | Kit | Sonidos → “Marimba mágica” | Aviso con el nombre; el kit queda resaltado | ✅ |
| M-14 | Mapeo | Cambiar “Rojo → …” | Aviso “Rojo → …”; se conserva al recargar | ✅ |
| M-15 | Persistencia | Recargar tras cambiar BPM y rejilla | Ajustes y licencia se conservan | ✅ |
| M-16 | Hojas con teclado | Tab dentro de la hoja; Escape | El foco queda atrapado y vuelve al botón de origen | ⬜ |
| M-17 | Offline | Instalar PWA → modo avión → recargar | El shell abre y la licencia sigue activa | ⬜ |
| M-18 | Actualización | Subir `VERSION` y recargar | Recarga automática a la versión nueva; en sesión en vivo, banner **Actualizar** | ⬜ |
| M-19 | Cámara denegada | Bloquear el permiso y pulsar **Iniciar sesión musical** | Error accionable y opción de bloques virtuales | ⬜ |
| M-20 | Demo vencida | Esperar 20 min o adelantar el reloj | Vuelve al bloqueo con mensaje de fin de prueba | ⬜ (no se esperó el tiempo completo) |
| M-21 | Variación por silueta | En simulador, colocar bloques altos y luego extendidos | El chip del HUD cambia (`grave/medio/agudo`, `negras/corcheas`) al empezar el compás | ✅ |
| M-22 | Armonía audible | Escuchar 30 s con varias formas | Ninguna nota desafina; la melodía sigue reconocible | ✅ |
| M-23 | Acentos | Ajustes → desactivar **Acentos de los bloques** | Cruzar bloques ya no produce el toque extra; la melodía continúa | ✅ |
| M-24 | Modo bloque → sonido | Ajustes → Modo de juego → **Bloques** | Vuelve el disparo por color y altura (HU-08/09) | ✅ |
| M-25 | Sombra sobre la pared | Mover la mano entre el móvil y la pared sin tocar bloques | La variación no cambia y no aparecen bloques fantasma | 🟡 (cubierto por prueba; falta pared real) |
| M-26 | Modo parrilla | Ajustes → **Parrilla** | El HUD muestra «Celdas», las filas se dibujan y los bloques se tiñen de su color | ✅ |
| M-27 | Pared vacía en silencio | Calibrar sin bloques y escuchar 15 s | No suena ninguna nota ni aparece celda activa | ✅ |
| M-28 | Color → instrumento | Poner un bloque de cada color en filas distintas | Cada color suena con su timbre; el HUD cuenta las celdas activas | ✅ |
| M-29 | Fila → nota | Mover un mismo bloque de arriba abajo | El timbre no cambia; la altura baja de agudo a grave sin salir de la escala | ✅ |
| M-30 | Una nota por bloque | Poner un bloque a caballo entre dos filas | Suena una sola vez, no dos | ✅ |
| M-31 | Mapeo de parrilla | Sonidos → cambiar «Rojo → …» y recargar | Solo aparecen instrumentos afinados; el cambio persiste | ✅ |
| M-32 | Cambio de modo | Alternar Parrilla / Retrato / Melodía / Bloques en marcha | El audio se recarga, el HUD cambia y el modo persiste al recargar | ✅ |
| M-33 | Consentimiento de Retrato | Ajustes → **Retrato** sin consentimiento | Aparece el aviso de privacidad con «Ahora no» y «Activar Retrato»; no se activa hasta aceptar | ✅ |
| M-34 | Retrato en vivo | Aceptar el aviso en simulador | HUD «Rostros 1», chip «Retrato · …» y caja/ojos/boca dibujados sobre la cara | ✅ |
| M-35 | Cambio de cara | Tocar la escena en modo Retrato | Otra piel y otro pelo; tras ~1 s cambia el chip de variación | ✅ |
| M-36 | Silencio sin cara | Ocultar la cara (escena vacía) | El chip pasa a «Retrato · esperando cara» y no suena ninguna nota | ✅ |
| M-37 | Gestos | Abrir la boca, sonreír y cerrar los ojos en el simulador | Cambian densidad, adorno y registro en el compás siguiente, sin desafinar | 🟡 (señales cubiertas por prueba; falta cara real) |
| M-38 | Retirar el consentimiento | Ajustes → desmarcar el aviso con Retrato activo | Vuelve a Parrilla y el HUD cambia | ✅ |

## 5. Plan de validación con hardware

> Requiere el kit físico. Ejecutar en al menos: un Android de gama media, un iPhone reciente y un
> portátil con webcam. Registrar modelo, navegador, versión y condiciones de luz.

### 5.1 Cámara y encuadre (HU-02/03/11/13)

1. Colocar el móvil en el soporte impreso en 3D, en horizontal, con la cámara hacia la pared.
2. Comprobar que la estructura entra completa y que no hay dedos, funda ni borde del soporte.
3. Calibrar con la pared vacía y construir en cada una de las 16 columnas.
4. **Criterio:** el contador del HUD coincide con lo construido y el chip de variación reacciona
   en el compás siguiente.
5. Repetir a 40, 70 y 100 cm de la pared y anotar la distancia mínima fiable.
6. Probar el móvil en horizontal y en vertical: el recorte «cover» debe mantener la estructura
   centrada en ambos casos.

### 5.2 Iluminación (HU-05)

| Escenario | Procedimiento | Criterio de aceptación |
| --- | --- | --- |
| Base | Luz de aula estable | Sin bloques fantasma durante 60 s |
| Cambio gradual | Bajar un dimer 20–30 % en 10 s | Los bloques siguen detectados; no aparecen fantasmas |
| Cambio brusco | Apagar/encender la luz principal | Se recupera en < 2 s; si no, **⟳** lo resuelve |
| Sol directo | Rayo de sol sobre parte de la mesa | No se pierde la columna afectada; sin falsos positivos |
| Sombras | Mover una mano sobre la mesa sin bloques | Sin disparos (si hay, bajar sensibilidad) |
| Proyector | Imagen blanca/cambio de diapositiva | El fondo no se “queda” con la imagen |

### 5.3 Latencia extremo a extremo (HU-06/08)

1. Activar **Clic de referencia** y **Mostrar rendimiento**.
2. Grabar con un móvil a 240 fps la mesa y el altavoz a la vez.
3. Medir entre el cruce visual de la línea y el ataque del sonido. Repetir 10 veces.
4. Ajustar **Compensación de cámara** hasta que el sonido coincida con el cruce.
5. **Criterio:** ≤ 200 ms percibidos tras la compensación; visión estable ≥ 18 fps.
6. Anotar el valor de compensación por modelo para el manual del profesor.

### 5.4 Falsos positivos y negativos (HU-03/08)

- Manos y mangas cruzando la mesa: no deben sonar de forma repetida.
- Reflejos en la mesa, manteles estampados y bordes de la base: no deben crear blobs.
- Bloques blancos y negros (bajo contraste): deben detectarse con sensibilidad media.
- Torres de 3–5 bloques: deben devolver todos los colores en el mismo instante.
- Bloque inclinado o girado: sigue siendo un bloque (conectividad 8).
- **Criterio:** 0 falsos positivos en 60 s de aula quieta; 0 torres incompletas en 20 pasadas.

### 5.5 QR impreso (HU-01)

1. Imprimir el código en papel mate (sin brillo) y pegarlo en el manual.
2. Probar a 15, 25 y 35 cm, con luz cálida y con poca luz.
3. Repetir en un Android con `BarcodeDetector` y en un navegador que use el respaldo `jsQR`.
4. Probar **Subir una foto** con una imagen borrosa y con reflejo.
5. Canjear el mismo código en un segundo dispositivo: debe fallar con “ya activado”.
6. **Criterio:** lectura en < 5 s a 25 cm; el canje se quema una sola vez; tras activar, la app
   abre sin red.

### 5.6 Audio (HU-06/09/10)

- Altavoz del móvil, Bluetooth y equipo del aula: medir el retraso de Bluetooth y documentar la
  compensación necesaria.
- Tocar una torre de 5 colores con 8 columnas y 190 BPM: sin clics, sin voces cortadas.
- Subir el volumen al 100 %: sin distorsión audible.
- Cambiar de kit en marcha: el siguiente paso ya usa el kit nuevo, sin silencios.

### 5.7 PWA, offline y ciclo de vida (HU-01/02)

1. Instalar la app desde el navegador y abrirla en modo `standalone`.
2. Comprobar safe areas (notch), rotación y barra de estado.
3. Activar modo avión y recargar: el shell debe abrir y la licencia seguir activa.
4. Publicar una versión con `VERSION` nuevo: debe aparecer el aviso y actualizar al reabrir.
5. Cerrar la pestaña durante 2 minutos y volver: sin ráfaga de notas y sin reinicio del tempo.

### 5.8 Accesibilidad

- Recorrido completo con **Tab** por bloqueo, onboarding, dock y hojas; orden lógico y foco visible.
- **Escape** cierra la hoja y devuelve el foco al control que la abrió.
- Lector de pantalla (NVDA o VoiceOver): nombres de botones, estados `aria-pressed` y diálogos.
- Zoom al 200 %: sin controles cortados; el dock permite desplazamiento horizontal.
- `prefers-reduced-motion`: sin destellos ni animaciones de entrada; el barrido se mantiene porque
  es el propio producto.
- Contraste de texto y chips ≥ 4.5:1 sobre el video (la viñeta ayuda en zonas claras).

### 5.9 Servidor y seguridad

```sh
curl -i http://localhost:4173/../../etc/passwd          # 404, sin salir de app/
curl -i -X POST http://localhost:4173/api/license/redeem \
  -H 'content-type: application/json' -d '{"token":"x","deviceId":"y"}'
```

- Verificar CSP, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy`.
- Enviar 40 POST seguidos: a partir del 31 debe responder `429`.
- Enviar un cuerpo > 8 KiB: debe rechazarse sin bloquear el proceso.
- Copia de seguridad: parar el servidor, copiar `server/data/licenses.json`, restaurarlo y
  comprobar que un código ya canjeado sigue canjeado.

### 5.10 Melodía reactiva (HU-12)

1. Empezar con la pared vacía: debe sonar la melodía base, sin huecos y sin acentos.
2. Construir una torre alta: en el siguiente compás el registro sube y el chip cambia.
3. Extender una base ancha: debe entrar el bajo y la tercera paralela.
4. Cambiar de color dominante (amarillo → azul): debe cambiar el instrumento solista.
5. Mover un bloque suelto y devolverlo en < 1 s: la canción **no** debe cambiar.
6. **Criterio:** 0 notas fuera de la pentatónica de Do o del acorde del compás en 2 minutos de
   improvisación; el pulso no se interrumpe en ningún cambio de forma.
7. Repetir en modo **Retrato**, **Bloques** y **Parrilla** para comparar las cuatro lecturas.

### 5.11 Parrilla de color (HU-14)

1. Calibrar con la pared vacía y confirmar que el HUD muestra **0 celdas** y no suena nada.
2. Colocar un bloque en cada una de las 8 filas de una misma columna: debe oírse una escalera
   ascendente sin ningún semitono fuera de la pentatónica.
3. Repetir con cada color: el timbre cambia, la altura de la fila se mantiene.
4. Poner dos bloques del mismo color en filas contiguas: debe sonar una sola nota.
5. Poner dos colores distintos apilados: deben sonar los dos instrumentos a la vez.
6. Retirar un bloque y devolverlo en < 340 ms: la nota no se corta ni se duplica.
7. Cambiar de 8 a 16 columnas en marcha: las celdas se recolocan y el pulso no se detiene.
8. **Criterio:** con la pared vacía no hay ninguna nota en 30 s; con bloques, cada pieza produce
   exactamente una nota por paso y ninguna combinación desafina.

### 5.12 Retrato sonoro (HU-15)

> Requiere una persona real frente a la cámara y el consentimiento del profesor. No se graba ni se
> guarda ninguna imagen: la prueba se hace en vivo y solo se anotan los valores del HUD.

1. Calibrar con la pared vacía y activar **Ajustes → Retrato** aceptando el aviso.
2. Sin nadie en cuadro: el chip debe decir «Retrato · esperando cara» y no debe sonar nada.
3. Entrar en cuadro: en ≤ 1 s debe aparecer la caja, el HUD «Rostros 1» y una variación propia.
4. Salir y volver a entrar con la misma persona: la variación debe ser la misma (semilla estable).
5. Entrar otra persona: tras ~1 s debe cambiar el chip; al volver la primera, vuelve su canción.
6. Gestos: abrir la boca (más densidad), sonreír (adorno) y cerrar los ojos (registro más grave).
   El cambio debe oírse **al empezar el compás**, nunca a mitad de nota.
7. Mover la cabeza: acentos suaves de carillón; desactivar **Acentos** y comprobar que desaparecen.
8. Luz cálida, contraluz y piel muy clara u oscura: la caja debe mantenerse; si falla, anotar el
   caso para ajustar `isSkin` y los cortes de `face.js`.
9. Dos personas en cuadro: solo debe seguirse la más grande (la más cerca).
10. **Criterio:** 0 notas fuera de la pentatónica o del acorde en 2 minutos de gestos; sin cara no
    suena nada; ninguna imagen ni firma queda almacenada (revisar `localStorage` y la pestaña Red).

## 6. Riesgos

| ID | Riesgo | Prob. | Impacto | Mitigación | Dueño |
| --- | --- | --- | --- | --- | --- |
| R-01 | Falsos positivos con manos, reflejos o mantel estampado | Alta | Medio | Confirmación de 2 frames, TTL, morfología, sensibilidad ajustable; validar en aula | CV |
| R-02 | Latencia percibida > 200 ms en móviles de gama media | Media | Alto | 20 fps, 320 px, compensación 0–300 ms, medir y documentar por modelo | Audio/CV |
| R-03 | Pérdida de detección por luz solar o sombras duras | Media | Medio | Factor de luz global, cromaticidad, recalibración rápida; evitar sol directo | CV |
| R-04 | Permiso de cámara denegado o no disponible (iOS) | Media | Alto | Mensaje accionable y simulador como respaldo; probar en iOS real | UX |
| R-05 | Licencia local copiable | Alta | Bajo (negocio) | El servidor impide canjear dos veces; `verify` ata el dispositivo | PO |
| R-06 | Fuga o pérdida del inventario de hashes | Baja | Alto | Solo hashes con pepper, copia de seguridad, permisos de archivo | PO/Tech |
| R-07 | Service worker sirve una versión vieja | Media | Medio | Subir `VERSION` en cada release; `updateViaCache: 'none'` y recarga automática al cambiar el controlador | Tech |
| R-08 | Saturación de voces en torres grandes y BPM alto | Baja | Medio | Tope de 48 voces; descartar la nueva sin bloquear el audio | Audio |
| R-09 | Pestaña oculta: rAF se detiene y la visión se congela | Media | Bajo | El audio sigue con lookahead ampliado; la visión se reanuda al volver | Tech |
| R-10 | Accesibilidad incompleta (lector de pantalla, zoom) | Media | Medio | Foco atrapado, `aria-*`, `:focus-visible`; falta auditoría formal | UX/QA |
| R-11 | Rotura de la calibración al mover la base | Alta | Bajo | **⟳ Recalibrar rápido** sin cortar la música; recalibrar en frío si el giro es grande | CV |
| R-12 | Primer toque tras el modo idle añade un bloque en simulador | Baja | Bajo | El primer toque solo despierta los controles | UX |
| R-13 | Las piezas que se tocan se fusionan y la variación no distingue piezas | Alta | Bajo | Por diseño: la música depende de la silueta, no de las piezas (ADR-15) | CV |
| R-14 | La madera del fondo se clasifica como `orange` | Alta | Medio | La calibración la elimina; vigilar cambios de luz y de encuadre | CV |
| R-15 | Una estructura enorme supera `maxArea = 45 %` y desaparece del HUD | Media | Bajo | La melodía no depende de los blobs; subir el límite si el HUD queda vacío | CV |
| R-16 | La variación cambia demasiado a menudo y distrae | Media | Medio | Histéresis de 900 ms y cambio solo en la columna 0 | Audio |
| R-17 | Blanco sobre pared clara o negro sobre fondo oscuro no alcanza la ocupación mínima | Media | Medio | Umbral 0,12 y muestreo de color dentro de la máscara; validar con el kit y, si falla, subir sensibilidad o retirar esos bloques | CV |
| R-18 | Un bloque ancho dispara varias notas al cruzar columnas | Media | Bajo | Es intencional (una nota por columna); si molesta, reducir columnas o usar bloques más estrechos | Audio |
| R-19 | Cara no detectada: perfil, contraluz, gafas o mascarilla | Media | Medio | Pedir encuadre frontal, calibrar con la pared vacía, subir sensibilidad; si falla, el silencio es seguro (no hay melodía base) | CV/UX |
| R-20 | Falso positivo de piel sobre madera o cartón poco saturado | Media | Medio | La sustracción de fondo es la defensa real: solo cuenta lo que no estaba en la calibración. Recalibrar si aparece una caja o un mural nuevo | CV |
| R-21 | La canción cambia sola al pasar gente por detrás | Media | Bajo | Solo se sigue la cara más grande y el cambio exige 900 ms estable; usar pared despejada | CV |
| R-22 | Lectura de gestos con poca luz (boca, sonrisa, ojos) | Media | Bajo | Los gestos solo modulan dimensiones acotadas: si no se leen, la canción sigue estable y afinada | CV |

## 7. Limitaciones conocidas

- La detección corre a **20 fps**; mover un bloque puede tardar ~100–300 ms en sonar.
- El disparo se decide al **programar** la nota: puede adelantarse hasta el lookahead (120 ms).
- La calibración con cámara usa `requestAnimationFrame`: si la pestaña está oculta, espera a
  volver a ser visible (el timeout se extiende, no falla en silencio).
- La recalibración en caliente corrige **traslación**, no rotación, zoom ni cambio de perspectiva.
- Los samples son **sintetizados**: no hay grabaciones reales ni carga de archivos del profesor.
- `BarcodeDetector` no existe en todos los navegadores; hay respaldo `jsQR`, foto y entrada manual.
- El desbloqueo local es copiable por diseño offline; la autoridad es el servidor.
- El modo demo dura 20 minutos, solo permite simulador y se pierde al cerrar la pestaña.
- La variación musical se decide por **silueta**: apilar piezas del mismo color no añade notas,
  cambia el registro/la densidad de la canción.
- La marimba una octava abajo (`register 0`) suena opaca; pendiente de ajuste de timbre.
- La parrilla exige **contraste** con el fondo calibrado: un bloque del mismo color que la pared
  puede no superar `GRID_MIN_OCCUPANCY`. La saturación ayuda con colores, no con neutros.
- Un bloque ancho ocupa varias columnas y suena una vez por columna; una torre del mismo color
  suena una sola nota (la de mayor ocupación).
- **Retrato:** la heurística es simple a propósito. Solo se sigue **una** cara (la mayor) y no hay
  estimación de pose ni de mirada: un perfil muy girado puede no detectarse.
- **Retrato:** `isSkin` es un rango YCbCr amplio; madera o cartón poco saturados pueden pasar el
  filtro si no estaban en la calibración del fondo.
- **Retrato:** los umbrales de expresión (boca, sonrisa, ojos) están calibrados sobre escenas
  sintéticas; falta medirlos con caras reales y luz cálida.
- **Retrato:** la semilla se pierde al cerrar la sesión; la misma persona obtiene la misma canción
  en la misma sesión, no entre sesiones (es efímero por diseño).
- **Retrato:** reutiliza la paleta afinada de la melodía; el kit elegido no cambia su sonido.

## 8. Criterios de salida (release gate)

- [ ] `node --test` en verde, sin omitidas.
- [ ] Cámara real validada en Android, iPhone y portátil (M-19 y §5.1).
- [ ] QR impreso canjeado y quemado en dos dispositivos (§5.5).
- [ ] Latencia ≤ 200 ms tras compensación en el móvil objetivo (§5.3).
- [ ] Cambio de luz gradual y brusco sin pérdida de bloques (§5.2).
- [ ] Retrato validado con caras reales, luz cálida y varias personas (§5.12).
- [ ] PWA instalada, offline y actualización verificadas (§5.7).
- [ ] Recorrido de teclado y lector de pantalla sin bloqueos (§5.8).
- [ ] Copia de seguridad y restauración del inventario probadas (§5.9).
- [ ] `docs/BACKLOG.md` actualizado con el estado real.

## 9. Registro de corridas

| Fecha | Entorno | Resultado | Notas |
| --- | --- | --- | --- |
| 24/10/2026 | Windows 11 · Node 24.19.0 | 55/55 | Suite completa; servidor en puerto efímero |
| 24/10/2026 | Chrome · simulador | ✅ | Activación manual, onboarding, BPM, pausa, rejilla, kits, mapeo, demo |
| 24/10/2026 | Windows 11 · Node 24.19.0 | 88/88 | Añadidas silueta, variación, canción, melodía y sombras |
| 24/10/2026 | Chrome · simulador | ✅ | HU-12: 34–44 notas/8 s, 0 fuera de escala; BPM 100→140 sin cortes; pausa detiene el agendado |
| 24/10/2026 | Chrome · sondeo de vídeo del kit | ✅ | 14 fotogramas: piezas fusionadas, mesa `orange`, blob > 50 % → origen de ADR-15 |
| 25/10/2026 | Windows 11 · Node 24.19.0 | 113/113 | Añadidas parrilla, altura pentatónica, mapeo afinado y rojo sobre madera |
| 25/10/2026 | Chrome · simulador | ✅ | Parrilla: pared vacía en silencio, 10 colores activos (0,25–0,37 de ocupación), una nota por bloque, cambio de modo y mapeo persistentes |
| 28/10/2026 | Windows 11 · Node 24.19.0 | 129/129 | Añadidos Retrato (16 pruebas) y contorno melódico; armonía de 1024 semillas × 2 gestos × 8 compases |
| 28/10/2026 | Chrome · simulador (escena `face`) | ✅ | Retrato: consentimiento, HUD «Rostros 1», chip «Retrato · campana · agudo · bajo», cambio de cara (semilla 565 → 1017), «Retrato · esperando cara» sin cara, 18–19 fps |
| 28/10/2026 | Chrome · GitHub Pages (`v7`) | ✅ | `sw.js` v7 y módulos nuevos publicados; el aviso de consentimiento aparece, **Activar Retrato** aplica el modo y persiste en `localStorage` |
| Pendiente | Android / iPhone + kit | — | Cámara, QR impreso, luz, latencia, PWA, pared, caras reales |
