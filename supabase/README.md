# supabase/ — base de datos real (v2)

La base de datos vive **fuera de GitHub**, en un proyecto de Supabase (Postgres + Auth). En este repositorio solo está
el **esquema** (`migrations/`), que no contiene datos ni secretos. Las claves van en `.env` (ignorado por Git) o como
secretos del proveedor; `.env.example` lista cuáles son.

| Clave | Dónde | ¿Pública? |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | navegador | Sí: no dan acceso por sí solas, lo limita RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | solo Edge Functions / servidor | **No.** Salta RLS. Nunca en el navegador ni en Git |
| `STRIPE_*`, `MERCADOPAGO_*`, `SMTP_*` | solo Edge Functions | **No** |

## Puesta en marcha

1. Crea el proyecto en supabase.com (región más cercana a México: `us-east-1` o `us-west-1`).
2. `supabase link --project-ref <ref>` y `supabase db push` (aplica `migrations/0001_esquema_inicial.sql`).
3. Carga el catálogo inicial desde `public/db/*.json` (Table Editor → Import, o un script con service_role).
4. Auth → Providers: email con confirmación activada; contraseña mínima 8; activa protección contra contraseñas filtradas.
5. Marca tu usuario como admin: `update profiles set role = 'admin' where id = '<uuid>';`

## Cambiar el sitio de staging a Supabase

Todo el acceso a datos está en tres sitios; el resto del sitio no cambia:

| Archivo | Objeto | Staging (hoy) | Supabase |
|---|---|---|---|
| `js/layout.jsx` | `auth` | `localStorage` `ig-users` / `ig-session` | `supabase.auth.signUp / signInWithPassword / signOut / getUser` |
| `js/tienda.jsx` | `db` | `/public/db/*.json`, pedidos en `ig-pedidos` | `from('products').select()`; pedidos vía Edge Function `crear-pedido` |
| `js/reservas.jsx` | `agenda` | `tratamientos.json`, citas en `ig-citas` | `from('treatments')`, `rpc('busy_slots')`, `from('appointments').insert / update({status:'cancelada'})` |

Pendiente (Edge Functions, en `supabase/functions/` cuando se creen):
- `crear-pedido`: recibe `[{ id, qty }]`, relee precios y stock de `products`, crea `orders` + `order_items`, abre el checkout
  de Stripe o Mercado Pago y devuelve la URL de pago.
- `webhook-pago`: verifica la firma del proveedor, marca el pedido `pagado` y descuenta stock.
- `recordatorio-citas` (cron): email / WhatsApp 24 h antes.
