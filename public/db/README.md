# public/db — base de datos simulada (staging)

Archivos JSON editados a mano que sustituyen a la base de datos hasta la v2 (Supabase, ver `supabase/README.md`).
**Son públicos** (se sirven en `https://individuelgeneve.com.mx/public/db/…`): nunca pongas aquí costes, proveedores ni datos de clientes.
Los nombres de campo coinciden con las columnas de `supabase/migrations/0001_esquema_inicial.sql`, así la migración es directa.

| Archivo | «Tabla» | Lo usa |
|---|---|---|
| `categorias.json` | `categories` | filtros de la boutique (las 6 categorías de Squarespace) |
| `productos.json` | `products` | boutique, fichas, inicio, ingredientes |
| `ingredientes.json` | `ingredients` | glosario, pestaña «Activos» de cada ficha |
| `tratamientos.json` | `schedule` + `groups` + `treatments` | menú de servicios, reservas, inicio |
| `blog.json` | `posts` | blog y páginas `/pages/blog/<slug>/` |
| `capsulas.json` | `capsules` | `/pages/capsulas/` |
| `cupones.json` | `groups` + `coupons` | `/pages/promociones/`, nota de cupón en las fichas, `prefilled_promo_code` de Stripe |

Cada archivo lleva `_schema`, `_note` y `updated_at`: actualiza `updated_at` al editar.
Origen (2026-11-01): `productos.json` y `categorias.json` desde el export de Squarespace `products_Nov-01_10-41-27AM.csv`;
el resto desde las páginas de individuelgeneve.com.mx. Las imágenes se descargaron a `/img/` en WebP.

## products

| Campo | Notas |
|---|---|
| `id` | permanente (`ig-001`…) |
| `slug` | URL `/pages/tienda/<slug>/`; minúsculas unidas por `-` |
| `sku` | SKU de Squarespace; se muestra en el pedido |
| `line` | línea de producto (`Advance Pro`) |
| `name`, `size` | nombre y contenido (`30ml`) |
| `price_mxn` | MXN con IVA, solo para mostrar (el cobro usa el precio del Payment Link: deben coincidir). **`null` = «Precio a consultar»**. El export trae todos los precios en 0 |
| `stripe_url` | Payment Link de Stripe (`https://buy.stripe.com/…`) → botón «Comprar ahora». `null` = «Pedir por WhatsApp». Otras URLs se ignoran |
| `stock` | `0` Agotado (sin botón de compra) · `1` Última unidad · `2–3` Solo quedan N · más = Disponible. Stripe no lo descuenta: actualízalo a mano (o limita el número de pagos en el Payment Link) |
| `active` | `false` oculta el producto en todo el sitio (Sonica: `Visible = No` en Squarespace) |
| `featured` | aparece en «Fórmulas Advance Pro» del inicio |
| `category_ids` | uno o varios `categories.id`; el primero es la categoría principal |
| `description`, `actives` | textos de la ficha (`actives` = los activos entre paréntesis del texto original) |
| `ingredient_ids` | ids de `ingredientes.json` |
| `images` | `[foto de producto, ficha informativa]` en `/img/productos/`. `images[0]` (fondo blanco) es la imagen de todas las tarjetas |
| `commercial_image` | foto comercial de estudio (`/img/productos/<slug>-comercial.webp`): imagen principal de la ficha; el fondo blanco queda como miniatura. `null` = la ficha abre con `images[0]` |
| `old_url` | URL en Squarespace; redirigida en `404.html` |

## schedule (tratamientos.json)

`days` (0 = domingo), `open` / `close` (HH:MM) — lo único que lee hoy `js/reservas.jsx`; `hours_by_day` guarda el horario real
por día (sáb y dom 10:00–16:00) para cuando se adapte el asistente —, `slot_min` (cada cuánto empieza un horario), `booking_window_days`,
`min_notice_hours`, `cabins` (citas simultáneas) y `closed_dates` (`YYYY-MM-DD`).

## Añadir un producto

1. Copia un objeto en `productos.json` con `id`, `slug` y `sku` nuevos.
2. `python tools/generar-paginas-producto.py` (crea `pages/tienda/<slug>/`).
3. Commit y push. Cambios de precio, stock o textos no necesitan regenerar.

## coupons (cupones.json)

| Campo | Notas |
|---|---|
| `code` | código, igual que el *Promotion code* de Stripe (mayúsculas, sin espacios) |
| `type` | `linea` · `minimo` · `producto` (agrupa la página y decide a qué productos aplica) |
| `title`, `discount`, `description`, `terms` | textos de la tarjeta; `discount` es texto libre («10 %», «$1,000») |
| `line`, `category_ids` | `linea` / `minimo`: aplica a la línea (o solo a esas categorías) |
| `product_slugs` | `producto`: slugs de `productos.json` |
| `min_purchase_mxn` | solo informativo; el mínimo real lo exige Stripe (*Minimum order value*) |
| `valid_until`, `active` | vencido o `false` → no se muestra |

El sitio no calcula descuentos: solo muestra el cupón y lo envía a Stripe, que lo valida.

## Añadir un artículo del blog

Añade un objeto a `blog.json` (`slug`, `title`, `date`, `author`, `excerpt`, `cover`, `blocks`) y ejecuta el mismo script:
también crea `pages/blog/<slug>/`. `blocks` es una lista de `{ "t": "h" | "p" | "li" | "quote" | "img", "v": "…" }`.
