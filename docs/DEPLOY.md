# Despliegue

La app es estática (ES modules, CSS plano, sin build). El servidor Node solo hace dos cosas:
servir `app/` y atender la API de licencias. Por eso se puede publicar en cualquier hosting
estático gratis y estable.

## URL pública

**https://rubendariogomeza.github.io/bloques-sonoros/**

- Repositorio: https://github.com/rubendariogomeza/bloques-sonoros
- Hosting: GitHub Pages (gratis, HTTPS, sin límite de tiempo).
- Se publica la carpeta `app/` tal cual: no hay paso de compilación.

## Cómo funciona

`.github/workflows/pages.yml` se dispara en cada push a `main`:

1. Descarga el repositorio.
2. Empaqueta `app/` con `actions/upload-pages-artifact`.
3. Publica con `actions/deploy-pages`.

Las rutas de `app/index.html`, el manifest y el service worker son relativas, así que la app
funciona igual en la raíz del dominio que en el subdirectorio `/bloques-sonoros/`.

## Actualizar el sitio

```sh
git add -A
git commit -m "Describe el cambio"
git push origin master:main
```

En 1–2 minutos GitHub Pages sirve la versión nueva. El service worker es cache-first: sube
`VERSION` en `app/sw.js` en cada release para que los móviles no se queden con la copia vieja. La
app comprueba `sw.js` sin caché HTTP y se recarga sola al detectar la versión nueva (si hay una
sesión en vivo, muestra **Actualizar** para no cortar la música).

## Modo prueba

`app/src/core/config.js` exporta `TEST_MODE = true`, que es lo que permite entrar sin QR y usar
la cámara. Para publicar una versión de producción:

1. Pon `TEST_MODE = false`.
2. Sube `VERSION` en `app/sw.js`.
3. Haz push.

Con `TEST_MODE = false` la app vuelve a pedir el código del manual. **GitHub Pages no ejecuta el
servidor Node**, así que el canje de QR no funciona en este hosting: para producción con
licencias hace falta desplegar `server/index.mjs` en un host con Node (Render, Railway, Fly.io o
un VPS) y servir `app/` desde ahí, o mantener Pages para la app y la API en otro dominio.

## Alternativas gratis

| Host | Ventaja | Cuándo usarlo |
| --- | --- | --- |
| GitHub Pages | Ya configurado, estable, HTTPS | Pruebas y demo pública |
| Cloudflare Pages | CDN rápida, `*.pages.dev` | Si se quiere desacoplar de GitHub |
| Netlify | Arrastrar la carpeta `app/` en el navegador | Publicar sin tocar git |
| Render / Railway / Fly.io | Ejecutan Node | Producción con canje de QR real |

En todos los casos el requisito de la cámara es el mismo: **HTTPS**. Los cuatro hostings lo dan
por defecto en su dominio.
