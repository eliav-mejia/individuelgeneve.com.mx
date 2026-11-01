# individuelgeneve.com.mx

Individuel Genève (operado por BELLEZA PRO MX): tratamientos faciales y corporales no invasivos en la Condesa, Ciudad de
México, y la boutique de fórmulas Advance Pro. Recreación del sitio de Squarespace (individuelgeneve.com.mx, leído el
2026-11-01) con su contenido, imágenes y catálogo reales.

Sitio estático (GitHub Pages, dominio `individuelgeneve.com.mx`), sin paso de build: Tailwind, React y Babel desde CDN,
igual que `lameyer.net`. Pensado para crecer a un repositorio React + Tailwind con build (v2) y base de datos real en
Supabase, fuera de GitHub.

**Estado: 1.1.0 · staging.** Contenido y catálogo reales. **Sin carrito: compra de un solo producto** con «Comprar ahora» →
Stripe Payment Link (`stripe_url` en `productos.json`). Mientras un producto no tenga link ni precio (el export de Squarespace
trae los precios en 0) el botón es «Pedir por WhatsApp». Las cuentas y citas se guardan solo en el navegador. Pendientes en «Versiones → 1.1.0». Revisar todos los `[verificar]` antes de publicar.

## Probar en local

```
py -m http.server 8125        # desde esta carpeta → http://localhost:8125
```

Hay que servirlo con un servidor (abrir el HTML con doble clic no funciona). Funciona en la raíz del dominio y bajo una subruta
(`eliav-mejia.github.io/individuelgeneve.com.mx/`): el `<head>` usa rutas relativas (`../../js/…`) y `BASE` en `js/layout.jsx`
antepone la subruta a todo `href`/`src`/`fetch` que empiece por `/`. En el código y los JSON escribe siempre rutas desde la raíz
(`/pages/…`, `/img/…`) y compara rutas con `PATH`, no con `location.pathname`.

## Identidad

| Token | Color | Uso |
|---|---|---|
| `white` | `#ffffff` | fondo, tarjetas |
| `blush-200` | `#f4dfe2` | rosa claro: secciones suaves, chips, botón «Reservar» |
| `blush-500` | `#c4848e` | acentos pequeños: palabras en cursiva, avisos |
| `ink` | `#2f2f33` | gris oscuro: texto, botones, pie |
| `ink-400` | `#6e6e74` | texto secundario |

Logo: el original del cliente (`IndividuelOperadoPorBELLEZAPROMX.png` de Squarespace) recortado a 900 px: `img/logo.webp` (tinta
`#2f2f33`) y `img/logo-blanco.webp` (fondos oscuros), en `Logo` de `js/layout.jsx`.
Tipografías: **Pinyon Script** (cursiva: palabras de acento) · **Cormorant Garamond** (títulos) · **Jost** (texto).
Tokens en `js/tailwind.config.js` (clases `bg-blush-200`, `text-ink`, `font-script`…) y en `:root` de `css/site.css`.
Componentes: `.btn .btn-dark / .btn-light / .btn-blush`, `.field`, `.label`, `.wash`, `.reveal`.

## Estructura de carpetas

Cada página es una carpeta con su `index.html` (URLs limpias, como en lameyer.net).

```
individuelgeneve.com.mx/
├── CNAME · .nojekyll · .gitignore · .env.example
├── README.md                     este archivo
├── index.html                    inicio: Facial glow up, servicios, Advance Pro, tecnologías, registro, cápsulas
├── 404.html                      página no encontrada + redirecciones (MOVED)
│
├── css/site.css                  UNA hoja de estilos: tokens, botones, campos, animaciones
├── js/
│   ├── tailwind.config.js        paleta y tipografías para Tailwind (CDN)
│   ├── layout.jsx                TODAS las páginas: BRAND, NAV_LINKS, cabecera, pie, cuentas (auth),
│   │                             cookies, PageHero, SectionTitle, renderPage()
│   ├── acceso.jsx                TODAS las páginas: ACCESS_RULES (login obligatorio en /pages/cuenta/)
│   │                             + loadJson/useJson, Img, Blocks (texto de artículos), WhatsAppCTA, LegalPage
│   ├── tienda.jsx                capa de datos `db`, useCatalog, ProductImage, BuyButton (Stripe), ProductCard, ProductPage
│   ├── reservas.jsx              capa de datos `agenda`, disponibilidad, BookingWizard
│   └── blog.jsx                  BlogIndex, BlogPost (renderPost)
│
├── public/db/                    BASE DE DATOS SIMULADA (JSON público) — ver public/db/README.md
├── supabase/                     BASE DE DATOS REAL (v2): esquema + RLS, sin datos ni secretos — ver supabase/README.md
├── img/                          imágenes migradas de Squarespace en WebP (una carpeta por página; productos/, blog/, capsulas/)
├── tools/generar-paginas-producto.py   crea pages/tienda/<slug>/ y pages/blog/<slug>/ desde productos.json y blog.json
│
├── pages/
│   ├── tienda/index.html         /pages/tienda/          boutique Advance Pro: filtro por categoría (?cat=), orden
│   ├── tienda/<slug>/            /pages/tienda/<slug>/   ficha de producto (generada)
│   ├── gracias/                  /pages/gracias/         página tras el pago (redirección de los Payment Links)
│   ├── ingredientes/             /pages/ingredientes/    glosario (#id por activo)
│   ├── tratamientos/             /pages/tratamientos/    menú de servicios + reserva (#reservar, ?tratamiento=<id>)
│   ├── capsulas/                 /pages/capsulas/        cápsulas de tratamiento (#slug)
│   ├── tecnologias/              /pages/tecnologias/     índice + sonnext/ ballancer/ mit/
│   ├── blog/ · blog/<slug>/      /pages/blog/            artículos (páginas generadas)
│   ├── especialistas/ · nosotros/ · partners/ · bolsa-de-trabajo/ · protocolo-de-seguridad/ · contacto/
│   ├── cuenta/                   /pages/cuenta/          citas y perfil (login obligatorio); los pagos se ven en Stripe
│   ├── terminos/                 /pages/terminos/        #citas #garantia #reembolsos #faq
│   ├── privacidad/               /pages/privacidad/
│   └── devoluciones/             /pages/devoluciones/
│
├── _docs/src/v1.0.0.html         PÚBLICO: documento de versión
└── _interno/                     LOCAL, NO SE PUBLICA (.gitignore): seguridad y pendientes sensibles
```

## Qué carga cada página

| Página | layout.jsx | acceso.jsx | tienda.jsx | reservas.jsx | blog.jsx |
|---|:-:|:-:|:-:|:-:|:-:|
| `index.html`, `pages/tienda/`, `pages/tienda/<slug>/`, `pages/ingredientes/` | ✓ | ✓ | ✓ | | |
| `pages/tratamientos/` | ✓ | ✓ | | ✓ | |
| `pages/cuenta/` | ✓ | ✓ | | ✓ | |
| `pages/blog/`, `pages/blog/<slug>/` | ✓ | ✓ | | | ✓ |
| el resto (contenido, legal, `404.html`) | ✓ | ✓ | | | |

Orden: `tailwind.config.js` (en el `<head>`) → `layout.jsx` → `acceso.jsx` → `tienda.jsx` → `reservas.jsx` → script de la página
(termina en `renderPage(MiPagina)`). No vuelvas a declarar en otro archivo nada de `layout.jsx`.

## Cambios habituales

- **Datos de la marca** (email, teléfono, WhatsApp, dirección, horario, Instagram): `BRAND` en `js/layout.jsx`.
- **Menú**: `NAV_LINKS` · **Pie**: `FOOTER_COLUMNS` (ambos en `js/layout.jsx`).
- **Compra («Comprar ahora»)**: crea en Stripe un Payment Link por producto (precio en MXN, dirección de envío y, si se quiere,
  cantidad ajustable; tras el pago, redirigir a `https://individuelgeneve.com.mx/pages/gracias/`) y pega su URL en `stripe_url`.
  Solo se aceptan URLs `https://buy.stripe.com/…`. El botón añade `client_reference_id` (SKU), `locale` y el email de la cuenta.
- **Horario de atención**: `OPENING_HOURS` en `js/layout.jsx` y `schedule` en `public/db/tratamientos.json`.
- **Productos, ingredientes, servicios, blog, cápsulas**: `public/db/*.json` (ver `public/db/README.md`).
- **Precios**: `price_mxn` en `productos.json` / `tratamientos.json`; `null` muestra «Precio a consultar».
- **Redirecciones** de las URL antiguas de Squarespace: `MOVED` en `404.html`.
- **Textos legales**: `SECTIONS` en `pages/terminos/` y `pages/privacidad/`. Los `[corchetes]` se ven resaltados hasta rellenarlos.
- **Páginas con login**: `ACCESS_RULES` en `js/acceso.jsx`. Nunca en las páginas legales.

## Añadir una página

1. Copia `pages/ingredientes/` a `pages/<nombre>/`, cambia `<title>`, descripción, canónica y el componente.
2. Si va en el menú, añádela a `NAV_LINKS`.

## Claves de almacenamiento local (staging)

`ig-users` · `ig-session` · `ig-citas` · `ig-cookies`. Desaparecen con la v2 salvo `ig-cookies`.

## Hoja de ruta

| Versión | Contenido |
|---|---|
| **1.0.0** | Sitio estático: tienda, fichas, bolsa → WhatsApp, ingredientes, reservas, cuenta, legal. Datos en JSON y navegador |
| 1.1 | Supabase: `auth`, `db`, `agenda` contra la base de datos real (`supabase/README.md`). Citas compartidas entre clientas |
| 1.2 | Pago en línea: Edge Function `crear-pedido` + Stripe / Mercado Pago, webhook, descuento de stock; recordatorios de cita |
| 2.0 | Repositorio con build: Vite + React + Tailwind (o Next.js con `output: 'export'`), mismos componentes y rutas; panel de administración (pedidos, agenda, stock) |

Al pasar a 2.0, cada `.jsx` se convierte en módulos (`layout.jsx` → `components/Layout.jsx`, etc.) y los JSON de `public/db/`
se retiran. Las URLs se mantienen, así que no hacen falta redirecciones.

## Versiones

### 1.1.0 — 2026-11-01 · Contenido real (staging)
- Catálogo real desde `products_Nov-01_10-41-27AM.csv` (export de Squarespace): 18 productos Advance Pro (17 visibles; Sonica
  oculto como en Squarespace), 6 categorías, SKU, stock y dos imágenes por producto. Sustituye los 8 productos de ejemplo.
- Contenido de individuelgeneve.com.mx: menú de servicios (13), cápsulas (10), SonNext, Ballancer, Tecnología MIT,
  especialistas, BELLEZA PRO MX, partners, bolsa de trabajo, protocolo de seguridad, contacto, blog (16 artículos),
  términos, privacidad y devoluciones. 176 imágenes migradas a `/img/` en WebP (7.5 MB).
- `404.html`: redirecciones desde las URL de Squarespace. Identidad visual sin cambios.
- Sin carrito: se eliminan la bolsa (`/pages/bolsa/` → tienda), el icono de la cabecera y los pedidos locales; cada producto se
  compra solo con «Comprar ahora» → Stripe Payment Link, o «Pedir por WhatsApp» si aún no tiene link. Nueva `/pages/gracias/`.
- Logo real del cliente en la cabecera, el menú móvil y el pie (antes, texto en Pinyon Script).
- Rutas compatibles con la subruta de GitHub Pages (`BASE` en `js/layout.jsx`, `<head>` con rutas relativas): arregla la página
  en blanco en `eliav-mejia.github.io/individuelgeneve.com.mx/`.
- **Pendiente del cliente:** precios (el export los trae en 0; una captura de 2024 en el inicio original mostraba
  $3,711–$4,574) y un Payment Link de Stripe por producto, costo de envío (se configura en cada Payment Link), duración de cada servicio (60 min supuesto), número de cabinas, correo de atención
  (la web escribe «atención@»), texto en inglés de Tinted Moisturizer, segunda condición incompleta de «Apelación» en términos,
  y si devoluciones sigue usando contacto@bellezapro.mx.
- **No incluido:** `js/reservas.jsx` sin cambios: el asistente reserva solo lun–vie 8:00–20:00 y muestra «$0» en los servicios
  sin precio.

### 1.0.0 — 2026-10-07 · Primera versión (staging)
- Estructura de carpetas y patrón de lameyer.net: `layout.jsx` compartido, base de datos simulada en `public/db/`, capa de
  datos única por dominio (`auth`, `db`, `agenda`), `_docs/` público y `_interno/` local.
- Identidad rosa claro / gris oscuro / blanco con cursiva Pinyon Script.
- Tienda de 8 productos en 4 pasos, fichas generadas con schema.org `Product`, bolsa sincronizada entre pestañas.
- Glosario de 10 activos enlazado con las fichas.
- Reserva de 4 tratamientos con agenda por horario, cabinas, antelación mínima y días cerrados; cuenta con citas y pedidos.
- Esquema de Supabase con RLS y restricción anti-solapes para la v1.1.
