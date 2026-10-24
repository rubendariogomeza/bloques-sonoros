# QA y riesgos

> Última corrida: **24/10/2026** · `node --test` → **55 pruebas, 55 pasan, 0 fallos, 0 omitidas**.
> Este documento distingue lo que está **probado de forma automática** de lo que **solo puede
> validarse con el kit físico**. No se marca como verificado nada que no se haya ejecutado.

## 1. Alcance

### Cubierto por la suite

- Matemática del secuenciador (BPM, columnas, fronteras, pausa, drift).
- Planificador con lookahead sobre un reloj simulado.
- Formato y checksum de tokens; canje y verificación de licencias.
- Servidor HTTP: archivos estáticos, cabeceras, traversal, rate limit, API de licencias.
- Pipeline de visión con frames sintéticos: fondo, luz, histéresis, morfología, blobs, capas,
  columnas, TTL y alineación por traslación.
- Mapeo color → sample y altura → semitono en los tres kits.

### No cubierto por la suite (requiere navegador u hardware)

- `getUserMedia`, permisos reales del sistema operativo y cámaras de móvil.
- Salida de audio real (altavoces, Bluetooth, latencia percibida).
- Ciclo de vida del service worker, instalación PWA y modo offline.
- Lectura de un QR impreso con luz real.
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

## 3. Matriz automatizada (55 pruebas)

### 3.1 Audio y tiempo — 16 pruebas

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
| | sanitizeMapping rellena huecos y descarta ids inválidos | ajustes corruptos no rompen el audio | HU-10 |

### 3.2 Licencias y servidor — 17 pruebas

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

### 3.3 Visión — 22 pruebas

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
| `vision-layers.test.js` | una torre de tres colores produce tres capas ordenadas | descomposición vertical | HU-09 |
| | una banda fina de transición no crea un bloque fantasma | bordes y mezclas de color | HU-08 |
| | sin máscara suficiente cae al color del centro | bloques pequeños o lejanos | HU-08 |
| | la silueta distingue cubo, torre y tablón | forma por relación de aspecto | HU-08 |
| `vision-shapes.test.js` | la apertura elimina píxeles sueltos | ruido de cámara | HU-03 |
| | el cierre rellena huecos de un bloque | reflejos y brillos | HU-03 |
| | etiqueta dos componentes separadas con área y caja correctas | dos bloques próximos | HU-08 |
| | descarta blobs por debajo del área mínima | motas y sombras pequeñas | HU-03 |
| | conectividad en diagonal une una torre inclinada | torres mal apiladas | HU-09 |

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
| M-18 | Actualización | Subir `VERSION` y recargar | Aviso “Versión nueva lista” | ⬜ |
| M-19 | Cámara denegada | Bloquear el permiso y pulsar **Iniciar sesión musical** | Error accionable y opción de bloques virtuales | ⬜ |
| M-20 | Demo vencida | Esperar 20 min o adelantar el reloj | Vuelve al bloqueo con mensaje de fin de prueba | ⬜ (no se esperó el tiempo completo) |

## 5. Plan de validación con hardware

> Requiere el kit físico. Ejecutar en al menos: un Android de gama media, un iPhone reciente y un
> portátil con webcam. Registrar modelo, navegador, versión y condiciones de luz.

### 5.1 Cámara y encuadre (HU-02/03/11)

1. Apoyar el móvil en la base del kit, cámara trasera hacia la mesa.
2. Comprobar que la mesa ocupa el ancho completo y que no hay dedos ni funda en el encuadre.
3. Calibrar con la mesa vacía y colocar un bloque en cada una de las 10 columnas.
4. **Criterio:** los 10 bloques se dibujan con su color correcto y el contador del HUD coincide.
5. Repetir con la cámara a 20, 30 y 45 cm y anotar la distancia mínima fiable.

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

## 6. Riesgos

| ID | Riesgo | Prob. | Impacto | Mitigación | Dueño |
| --- | --- | --- | --- | --- | --- |
| R-01 | Falsos positivos con manos, reflejos o mantel estampado | Alta | Medio | Confirmación de 2 frames, TTL, morfología, sensibilidad ajustable; validar en aula | CV |
| R-02 | Latencia percibida > 200 ms en móviles de gama media | Media | Alto | 20 fps, 320 px, compensación 0–300 ms, medir y documentar por modelo | Audio/CV |
| R-03 | Pérdida de detección por luz solar o sombras duras | Media | Medio | Factor de luz global, cromaticidad, recalibración rápida; evitar sol directo | CV |
| R-04 | Permiso de cámara denegado o no disponible (iOS) | Media | Alto | Mensaje accionable y simulador como respaldo; probar en iOS real | UX |
| R-05 | Licencia local copiable | Alta | Bajo (negocio) | El servidor impide canjear dos veces; `verify` ata el dispositivo | PO |
| R-06 | Fuga o pérdida del inventario de hashes | Baja | Alto | Solo hashes con pepper, copia de seguridad, permisos de archivo | PO/Tech |
| R-07 | Service worker sirve una versión vieja | Media | Medio | Subir `VERSION` en cada release; aviso de actualización | Tech |
| R-08 | Saturación de voces en torres grandes y BPM alto | Baja | Medio | Tope de 48 voces; descartar la nueva sin bloquear el audio | Audio |
| R-09 | Pestaña oculta: rAF se detiene y la visión se congela | Media | Bajo | El audio sigue con lookahead ampliado; la visión se reanuda al volver | Tech |
| R-10 | Accesibilidad incompleta (lector de pantalla, zoom) | Media | Medio | Foco atrapado, `aria-*`, `:focus-visible`; falta auditoría formal | UX/QA |
| R-11 | Rotura de la calibración al mover la base | Alta | Bajo | **⟳ Recalibrar rápido** sin cortar la música; recalibrar en frío si el giro es grande | CV |
| R-12 | Primer toque tras el modo idle añade un bloque en simulador | Baja | Bajo | El primer toque solo despierta los controles | UX |

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

## 8. Criterios de salida (release gate)

- [ ] `node --test` en verde, sin omitidas.
- [ ] Cámara real validada en Android, iPhone y portátil (M-19 y §5.1).
- [ ] QR impreso canjeado y quemado en dos dispositivos (§5.5).
- [ ] Latencia ≤ 200 ms tras compensación en el móvil objetivo (§5.3).
- [ ] Cambio de luz gradual y brusco sin pérdida de bloques (§5.2).
- [ ] PWA instalada, offline y actualización verificadas (§5.7).
- [ ] Recorrido de teclado y lector de pantalla sin bloqueos (§5.8).
- [ ] Copia de seguridad y restauración del inventario probadas (§5.9).
- [ ] `docs/BACKLOG.md` actualizado con el estado real.

## 9. Registro de corridas

| Fecha | Entorno | Resultado | Notas |
| --- | --- | --- | --- |
| 24/10/2026 | Windows 11 · Node 24.19.0 | 55/55 | Suite completa; servidor en puerto efímero |
| 24/10/2026 | Chrome · simulador | ✅ | Activación manual, onboarding, BPM, pausa, rejilla, kits, mapeo, demo |
| Pendiente | Android / iPhone + kit | — | Cámara, QR impreso, luz, latencia, PWA |
