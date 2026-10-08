-- Individuel Genève · esquema inicial (v2: base de datos real). NO se ejecuta en GitHub Pages.
-- Aplicar con:  supabase db push   (o pegar en el SQL Editor del proyecto de Supabase)
--
-- Principios:
--   · El navegador solo usa la anon key. Toda la seguridad la dan las políticas RLS de este archivo.
--   · Catálogo y agenda: lectura pública. Escritura solo para el rol admin (o service_role desde el panel / Edge Functions).
--   · Pedidos: los crea una Edge Function con service_role, que recalcula precios desde `products`. El navegador nunca
--     inserta pedidos ni fija precios.
--   · Citas: la clienta crea y cancela las suyas; una restricción de exclusión impide solapes en la propia base de datos.
--   · Disponibilidad: función `busy_slots()` que devuelve solo intervalos ocupados, sin datos personales.

create extension if not exists btree_gist;

-- ---------- PERFILES ----------
create table public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    full_name   text not null default '',
    phone       text,
    role        text not null default 'cliente' check (role in ('cliente', 'admin')),
    marketing_opt_in boolean not null default false,
    created_at  timestamptz not null default now()
);

-- Crea el perfil al registrarse (nombre desde auth.signUp({ options: { data: { full_name } } })).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
    return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- CATÁLOGO (mismos campos que public/db/*.json) ----------
create table public.categories (
    id text primary key, label text not null, step text not null, description text, sort_order int not null default 0
);

create table public.ingredients (
    id text primary key, name text not null, family text, what text, benefits text[] not null default '{}',
    pairs_with text[] not null default '{}', caution text
);

create table public.products (
    id              text primary key,
    slug            text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    sku             text unique not null,
    category_id     text not null references public.categories (id),
    name            text not null,
    hero_ingredient text not null,
    concentration   text,
    size_ml         int check (size_ml > 0),
    price_mxn       numeric(10, 2) not null check (price_mxn >= 0),
    stock           int not null default 0 check (stock >= 0),
    active          boolean not null default true,
    featured        boolean not null default false,
    bottle          text, tint text, short text, description text, how_to_use text,
    routine         text check (routine in ('am', 'pm', 'am-pm')),
    skin_types      text[] not null default '{}',
    ingredient_ids  text[] not null default '{}',
    inci            text,
    updated_at      timestamptz not null default now()
);

-- ---------- PEDIDOS ----------
create table public.orders (
    id          text primary key,                                     -- IG-XXXX
    user_id     uuid not null references auth.users (id),
    status      text not null default 'pendiente' check (status in ('pendiente', 'pagado', 'enviado', 'entregado', 'cancelado', 'reembolsado')),
    subtotal    numeric(10, 2) not null, shipping numeric(10, 2) not null, total numeric(10, 2) not null,
    shipping_address jsonb,
    payment_provider text, payment_ref text,                          -- Stripe / Mercado Pago (sin datos de tarjeta)
    created_at  timestamptz not null default now()
);

create table public.order_items (
    order_id    text references public.orders (id) on delete cascade,
    product_id  text references public.products (id),
    sku         text not null, name text not null,
    qty         int not null check (qty > 0),
    price_mxn   numeric(10, 2) not null,                              -- precio congelado al comprar
    primary key (order_id, product_id)
);

-- ---------- AGENDA ----------
create table public.treatments (
    id text primary key, name text not null, duration_min int not null check (duration_min > 0),
    price_mxn numeric(10, 2) not null, short text, description text, includes text[] not null default '{}',
    ideal_for text, active boolean not null default true, sort_order int not null default 0
);

create table public.appointments (
    id            text primary key default ('CITA-' || upper(substr(md5(random()::text), 1, 8))),
    user_id       uuid not null default auth.uid() references auth.users (id),
    treatment_id  text not null references public.treatments (id),
    cabin         int not null default 1,
    starts_at     timestamptz not null,
    ends_at       timestamptz not null,
    phone         text not null,
    notes         text check (char_length(notes) <= 500),             -- puede contener datos sensibles (salud): solo la dueña y admin
    status        text not null default 'confirmada' check (status in ('confirmada', 'cancelada', 'completada', 'no_asistio')),
    created_at    timestamptz not null default now(),
    check (ends_at > starts_at),
    -- Dos citas activas no pueden solaparse en la misma cabina, aunque se confirmen a la vez.
    exclude using gist (cabin with =, tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelada')
);

-- La duración siempre viene del tratamiento, no del navegador.
create function public.set_appointment_end() returns trigger language plpgsql as $$
begin
    select new.starts_at + make_interval(mins => t.duration_min) into new.ends_at from public.treatments t where t.id = new.treatment_id;
    return new;
end $$;
create trigger appointments_end before insert or update of starts_at, treatment_id on public.appointments
    for each row execute function public.set_appointment_end();

-- Intervalos ocupados de un día, sin datos personales (para pintar horarios libres).
create function public.busy_slots(day date) returns table (cabin int, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
    select cabin, starts_at, ends_at from public.appointments
    where status <> 'cancelada' and (starts_at at time zone 'America/Mexico_City')::date = day;
$$;
grant execute on function public.busy_slots(date) to anon, authenticated;

-- ---------- RLS ----------
alter table public.profiles     enable row level security;
alter table public.categories   enable row level security;
alter table public.ingredients  enable row level security;
alter table public.products     enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;
alter table public.treatments   enable row level security;
alter table public.appointments enable row level security;

-- Perfiles: cada quien el suyo (sin poder cambiarse el rol).
create policy "perfil propio: leer"      on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "perfil propio: editar"    on public.profiles for update using (id = auth.uid())
    with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- Catálogo y tratamientos: lectura pública; escritura solo admin.
create policy "catálogo: leer"     on public.categories  for select using (true);
create policy "ingredientes: leer" on public.ingredients for select using (true);
create policy "productos: leer"    on public.products    for select using (active or public.is_admin());
create policy "tratamientos: leer" on public.treatments  for select using (active or public.is_admin());
create policy "catálogo: admin"     on public.categories  for all using (public.is_admin()) with check (public.is_admin());
create policy "ingredientes: admin" on public.ingredients for all using (public.is_admin()) with check (public.is_admin());
create policy "productos: admin"    on public.products    for all using (public.is_admin()) with check (public.is_admin());
create policy "tratamientos: admin" on public.treatments  for all using (public.is_admin()) with check (public.is_admin());

-- Pedidos: la clienta solo LEE los suyos. Sin política de insert: solo service_role (Edge Function) los crea.
create policy "pedidos propios: leer" on public.orders      for select using (user_id = auth.uid() or public.is_admin());
create policy "líneas propias: leer"  on public.order_items for select using (
    exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
create policy "pedidos: admin"        on public.orders      for update using (public.is_admin()) with check (public.is_admin());

-- Citas: crear y leer las propias; la clienta solo puede cancelar (las demás transiciones, admin).
create policy "citas propias: leer"   on public.appointments for select using (user_id = auth.uid() or public.is_admin());
create policy "citas propias: crear"  on public.appointments for insert with check (
    user_id = auth.uid() and status = 'confirmada' and starts_at > now() + interval '12 hours');
create policy "citas propias: cancelar" on public.appointments for update
    using (user_id = auth.uid() and status = 'confirmada')
    with check (user_id = auth.uid() and status = 'cancelada');
create policy "citas: admin"          on public.appointments for all using (public.is_admin()) with check (public.is_admin());

-- Columnas que la clienta puede tocar al cancelar: solo status. (Desde el navegador, admin también queda limitado a
-- status; reprogramar o editar notas se hace en el panel de Supabase o en una Edge Function con service_role.)
revoke update on public.appointments from authenticated;
grant update (status) on public.appointments to authenticated;
