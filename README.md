# individuelgeneve.com.mx

Individuel Genève: cuidado de la piel minimalista con activos esenciales. Tienda en línea, glosario de ingredientes
y reserva de tratamientos faciales en Ciudad de México.

Sitio estático (GitHub Pages, dominio `individuelgeneve.com.mx`), sin paso de build: Tailwind, React y Babel desde CDN,
igual que `lameyer.net`. Pensado para crecer a un repositorio React + Tailwind con build (v2) y base de datos real en
Supabase, fuera de GitHub.

**Estado: 1.0.0 · staging.** Catálogo, precios, INCI y textos legales son de ejemplo; las cuentas, pedidos y citas se
guardan solo en el navegador. Revisar todos los `[marcadores]` y `[verificar]` antes de publicar.

## Probar en local

```
py -m http.server 8125        # desde esta carpeta → http://localhost:8125
```

Las rutas son absolutas (`/css/site.css`), así que hay que servir desde la raíz; abrir el HTML con doble clic no funciona.

## Identidad

| Token | Color | Uso |
|---|---|---|
| `white` | `#ffffff` | fondo, tarjetas |
| `blush-200` | `#f4dfe2` | rosa claro: secciones suaves, chips, botón «Reservar» |
| `blush-500` | `#c4848e` | acentos pequeños: palabras en cursiva, avisos |
| `ink` | `#2f2f33` | gris oscuro: texto, botones, pie |
| `ink-400` | `#6e6e74` | texto secundario |

Tipografías: **Pinyon Script** (cursiva: logo y palabras de acento) · **Cormorant Garamond** (títulos) · **Jost** (texto).
Tokens en `js/tailwind.config.js` (clases `bg-blush-200`, `text-ink`, `font-script`…) y en `:root` de `css/site.css`.
Componentes: `.btn .btn-dark / .btn-light / .btn-blush`, `.field`, `.label`, `.wash`, `.reveal`.

## Estructura de carpetas

Cada página es una carpeta con su `index.html` (URLs limpias, como en lameyer.net).

```
individuelgeneve.com.mx/
├── CNAME · .nojekyll · .gitignore · .env.example
├── README.md                     este archivo
├── index.html                    inicio: bodegón, filosofía, ritual, favoritos, ingredientes, tratamientos
├── 404.html                      página no encontrada + redirecciones (MOVED)
│
├── css/site.css                  UNA hoja de estilos: tokens, botones, campos, animaciones
├── js/
│   ├── tailwind.config.js        paleta y tipografías para Tailwind (CDN)
│   ├── layout.jsx                TODAS las páginas: BRAND, NAV_LINKS, cabecera, pie, cuentas (auth), bolsa (bag),
│   │                             cookies, PageHero, SectionTitle, renderPage()
│   ├── acceso.jsx                TODAS las páginas: ACCESS_RULES (login obligatorio en /pages/cuenta/)
│   ├── tienda.jsx                capa de datos `db`, useCatalog, Bottle (frasco SVG), ProductCard, ProductPage, pedidos
│   └── reservas.jsx              capa de datos `agenda`, disponibilidad, BookingWizard
│
├── public/db/                    BASE DE DATOS SIMULADA (JSON público) — ver public/db/README.md
├── supabase/                     BASE DE DATOS REAL (v2): esquema + RLS, sin datos ni secretos — ver supabase/README.md
├── img/favicon.svg
├── tools/generar-paginas-producto.py   crea pages/tienda/<slug>/ desde productos.json
│
├── pages/
│   ├── tienda/index.html         /pages/tienda/          filtros por paso (?cat=), momento del día, orden
│   ├── tienda/<slug>/            /pages/tienda/<slug>/   ficha de producto (generada)
│   ├── bolsa/                    /pages/bolsa/           bolsa y pedido (WhatsApp en staging)
│   ├── ingredientes/             /pages/ingredientes/    glosario (#id por activo)
│   ├── tratamientos/             /pages/tratamientos/    tratamientos + reserva (#reservar, ?tratamiento=<id>)
│   ├── cuenta/                   /pages/cuenta/          citas, pedidos y perfil (login obligatorio)
│   ├── terminos/                 /pages/terminos/        #precios #envios #devoluciones #citas
│   └── privacidad/               /pages/privacidad/      aviso de privacidad (LFPDPPP)
│
├── _docs/src/v1.0.0.html         PÚBLICO: documento de versión
└── _interno/                     LOCAL, NO SE PUBLICA (.gitignore): seguridad y pendientes sensibles
```

## Qué carga cada página

| Página | layout.jsx | acceso.jsx | tienda.jsx | reservas.jsx |
|---|:-:|:-:|:-:|:-:|
| `index.html` | ✓ | ✓ | ✓ | ✓ |
| `pages/tienda/`, `pages/tienda/<slug>/`, `pages/bolsa/`, `pages/ingredientes/` | ✓ | ✓ | ✓ | |
| `pages/tratamientos/` | ✓ | ✓ | | ✓ |
| `pages/cuenta/` | ✓ | ✓ | ✓ | ✓ |
| `pages/terminos/`, `pages/privacidad/`, `404.html` | ✓ | ✓ | | |

Orden: `tailwind.config.js` (en el `<head>`) → `layout.jsx` → `acceso.jsx` → `tienda.jsx` → `reservas.jsx` → script de la página
(termina en `renderPage(MiPagina)`). No vuelvas a declarar en otro archivo nada de `layout.jsx`.

## Cambios habituales

- **Datos de la marca** (email, teléfono, WhatsApp, dirección, horario, Instagram): `BRAND` en `js/layout.jsx`.
- **Menú**: `NAV_LINKS` · **Pie**: `FOOTER_COLUMNS` (ambos en `js/layout.jsx`).
- **Envío**: `SHIPPING_MXN` y `FREE_SHIPPING_MXN` en `js/layout.jsx` (banner, bolsa y términos se actualizan solos).
- **Productos, ingredientes, tratamientos, horario de cabina**: `public/db/*.json`.
- **Textos legales**: `SECTIONS` en `pages/terminos/` y `pages/privacidad/`. Los `[corchetes]` se ven resaltados hasta rellenarlos.
- **Páginas con login**: `ACCESS_RULES` en `js/acceso.jsx`. Nunca en las páginas legales.

## Añadir una página

1. Copia `pages/ingredientes/` a `pages/<nombre>/`, cambia `<title>`, descripción, canónica y el componente.
2. Si va en el menú, añádela a `NAV_LINKS`.

## Claves de almacenamiento local (staging)

`ig-users` · `ig-session` · `ig-bolsa` · `ig-pedidos` · `ig-citas` · `ig-cookies`. Desaparecen con la v2 salvo `ig-bolsa` y `ig-cookies`.

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

### 1.0.0 — 2026-10-07 · Primera versión (staging)
- Estructura de carpetas y patrón de lameyer.net: `layout.jsx` compartido, base de datos simulada en `public/db/`, capa de
  datos única por dominio (`auth`, `db`, `agenda`), `_docs/` público y `_interno/` local.
- Identidad rosa claro / gris oscuro / blanco con cursiva Pinyon Script.
- Tienda de 8 productos en 4 pasos, fichas generadas con schema.org `Product`, bolsa sincronizada entre pestañas.
- Glosario de 10 activos enlazado con las fichas.
- Reserva de 4 tratamientos con agenda por horario, cabinas, antelación mínima y días cerrados; cuenta con citas y pedidos.
- Esquema de Supabase con RLS y restricción anti-solapes para la v1.1.
