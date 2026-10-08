# public/db — base de datos simulada (staging)

Archivos JSON editados a mano que sustituyen a la base de datos hasta la v2 (Supabase, ver `supabase/README.md`).
**Son públicos** (se sirven en `https://individuelgeneve.com.mx/public/db/…`): nunca pongas aquí costes, proveedores ni datos de clientes.
Los nombres de campo coinciden con las columnas de `supabase/migrations/0001_esquema_inicial.sql`, así la migración es directa.

| Archivo | «Tabla» | Lo usa |
|---|---|---|
| `categorias.json` | `categories` | pasos del ritual: filtros de la tienda, inicio |
| `productos.json` | `products` | tienda, fichas, bolsa, inicio, ingredientes |
| `ingredientes.json` | `ingredients` | glosario, pestaña «Activos» de cada ficha, productos relacionados |
| `tratamientos.json` | `schedule` + `treatments` | tratamientos, reservas, inicio |

Cada archivo lleva `_schema`, `_note` y `updated_at`: actualiza `updated_at` al editar.

## products

| Campo | Notas |
|---|---|
| `id` | permanente (`ig-001`…); la bolsa lo guarda. Los dos últimos dígitos forman el «N°» |
| `slug` | URL `/pages/tienda/<slug>/`; minúsculas unidas por `-` |
| `sku` | se muestra en el pedido |
| `category_id` | uno de `categories.id` |
| `name`, `hero_ingredient`, `concentration`, `size_ml` | etiqueta del frasco y ficha |
| `price_mxn` | MXN con IVA |
| `stock` | `0` Agotado · `1` Última unidad · `2–3` Solo quedan N · más = Disponible. La bolsa nunca supera el stock |
| `active` | `false` oculta el producto en todo el sitio |
| `featured` | aparece en «Nuestros favoritos» y en el bodegón del inicio (los 3 primeros) |
| `bottle` | `dropper` · `pump` · `jar` · `tube` · `mist` (ilustración SVG) |
| `tint` | color del frasco (`#hex`), mejor dentro de la paleta rosa / blanco |
| `routine` | `am` · `pm` · `am-pm` |
| `ingredient_ids` | ids de `ingredientes.json` |
| `inci` | lista completa de ingredientes (pestaña «Fórmula completa») |

## schedule (tratamientos.json)

`days` (0 = domingo), `open` / `close` (HH:MM), `slot_min` (cada cuánto empieza un horario), `booking_window_days`,
`min_notice_hours`, `cabins` (citas simultáneas) y `closed_dates` (`YYYY-MM-DD`).

## Añadir un producto

1. Copia un objeto en `productos.json` con `id`, `slug` y `sku` nuevos.
2. `python tools/generar-paginas-producto.py` (crea `pages/tienda/<slug>/`).
3. Commit y push. Cambios de precio, stock o textos no necesitan regenerar.
