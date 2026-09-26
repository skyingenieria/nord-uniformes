-- Nord Uniformes — Etapa 2 de la migración a Supabase: clientes, pedidos,
-- pagos, facturas, códigos de descuento y roles de usuario.
-- Reemplaza las hojas 'Clientes', 'Pedidos', 'Ordenes', 'Facturas' y 'Codigos'
-- del Sheet ERP. Requiere haber corrido antes supabase/schema.sql (catálogo).
--
-- Correr una sola vez en el SQL Editor de Supabase (Project -> SQL Editor -> New query).

create extension if not exists pgcrypto;

-- Roles de usuario --
-- Un registro por cada login de Supabase Auth (creado a mano desde el
-- dashboard de Supabase: Authentication -> Users -> Add user, y después un
-- insert acá con su rol). "admin" ve todo; "vendedor" solo la parte de venta.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  rol text not null default 'vendedor' check (rol in ('admin', 'vendedor')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "select_own_profile" on profiles for select using (auth.uid() = id);

-- Clientes --
create sequence if not exists clientes_nro_seq;

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  colegio text not null default 'WS',
  nro integer not null default nextval('clientes_nro_seq'),
  nombre text not null,
  apellido text not null default '',
  email text not null unique,
  telefono text not null default '',
  codigo text generated always as (colegio || nro::text) stored,
  created_at timestamptz not null default now()
);
create index if not exists clientes_codigo_idx on clientes (codigo);
alter table clientes enable row level security;

-- Códigos de descuento --
create table if not exists codigos_descuento (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  descuento_pct numeric(5,2) not null default 0,
  usos_max integer not null default 0,
  usos_actuales integer not null default 0,
  activo boolean not null default true,
  valido_hasta date,
  created_at timestamptz not null default now()
);
alter table codigos_descuento enable row level security;

-- Pedidos --
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  numero text unique,                 -- formato "YY-NN", lo completa el trigger de abajo
  colegio text not null default 'WS',
  cliente_id uuid not null references clientes(id),
  forma_pago text not null default 'Transf. Banc.',
  cargo_envio numeric(12,2) not null default 0,
  descuento numeric(12,2) not null default 0,
  envio text not null default '',
  estado_envio text not null default 'Pendiente',
  estado_pago text not null default 'Pendiente',
  vendedor_id uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists pedidos_cliente_id_idx on pedidos (cliente_id);
alter table pedidos enable row level security;

-- Siguiente número de pedido del año en curso (hora Argentina), tomando el
-- máximo ya usado. El unique de "numero" evita duplicados ante una carrera;
-- a esta escala de ventas por día el riesgo es despreciable.
create or replace function next_pedido_numero()
returns text
language plpgsql
as $$
declare
  anio text := to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YY');
  siguiente int;
begin
  select coalesce(max((split_part(numero, '-', 2))::int), 0) + 1
  into siguiente
  from pedidos
  where numero like anio || '-%';
  return anio || '-' || lpad(siguiente::text, 2, '0');
end;
$$;

create or replace function set_pedido_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null then
    new.numero := next_pedido_numero();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_pedido_numero on pedidos;
create trigger trg_set_pedido_numero
before insert on pedidos
for each row execute function set_pedido_numero();

-- Items del pedido (prendas vendidas) --
-- Precio y costo se copian del talle al momento de la venta (snapshot): si el
-- precio en el catálogo cambia después, no altera pedidos ya facturados.
create table if not exists pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  nombre_prenda text not null,
  talle text not null,
  cantidad integer not null default 1,
  precio_unitario numeric(12,2) not null default 0,
  costo_unitario numeric(12,2) not null default 0
);
create index if not exists pedido_items_pedido_id_idx on pedido_items (pedido_id);
alter table pedido_items enable row level security;

-- Pagos (pueden ser varios por pedido: parciales) --
create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  monto numeric(12,2) not null,
  forma_pago text not null default '',
  fecha date not null default current_date,
  registrado_por uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists pagos_pedido_id_idx on pagos (pedido_id);
alter table pagos enable row level security;

-- Facturas (Factura C — ARCA/AFIP) --
create table if not exists facturas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references pedidos(id),
  cliente_id uuid references clientes(id),
  importe numeric(12,2) not null,
  tipo_receptor text not null default 'Consumidor Final',
  numero_comprobante text not null,
  cae text not null,
  cae_vencimiento date,
  fecha date not null default current_date,
  ambiente text not null default 'homologacion',
  qr_url text not null default '',
  created_at timestamptz not null default now()
);
alter table facturas enable row level security;

-- Vista: total y saldo por pedido --
-- Reemplaza las columnas calculadas por fórmula que tenía la hoja 'Pedidos'
-- (Total Venta, Monto Pago, Saldo, etc.).
create or replace view pedidos_con_saldo as
select
  p.id, p.numero, p.colegio, p.cliente_id, p.forma_pago, p.cargo_envio,
  p.descuento, p.envio, p.estado_envio, p.estado_pago, p.vendedor_id, p.created_at,
  coalesce(items.cant, 0) as cant,
  coalesce(items.monto, 0) as monto,
  coalesce(items.monto, 0) + p.cargo_envio - p.descuento as total_venta,
  coalesce(pagos.monto_pagado, 0) as monto_pagado,
  (coalesce(items.monto, 0) + p.cargo_envio - p.descuento) - coalesce(pagos.monto_pagado, 0) as saldo
from pedidos p
left join (
  select pedido_id, sum(cantidad) as cant, sum(cantidad * precio_unitario) as monto
  from pedido_items group by pedido_id
) items on items.pedido_id = p.id
left join (
  select pedido_id, sum(monto) as monto_pagado
  from pagos group by pedido_id
) pagos on pagos.pedido_id = p.id;

-- RLS habilitado sin policies en todas las tablas de negocio: solo la
-- service_role key (usada desde las funciones serverless de Vercel) puede
-- leer/escribir. Cuando la web app nueva hable directo con Supabase usando
-- Supabase Auth, se agregan policies específicas por rol (admin/vendedor).
