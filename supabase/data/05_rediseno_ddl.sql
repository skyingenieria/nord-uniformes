-- Rediseno de la base (pedido de Flor, 2026-09-26):
--  1) Numerar todas las tablas (001+ = tablas madre, 101+ = vistas calculadas)
--  2) Separar identidad del talle (SKU) de su stock/costo/precio, que pasan
--     a ser HISTORICOS (una fila por cambio, nunca una columna nueva) para
--     poder saber el precio/costo vigente en cualquier fecha pasada.
--  3) pedido_items -> ordenes
--  4) Eliminar codigos_descuento (no se usa)
--  5) Agregar proveedores y compras (reemplaza la hoja Compras)
--
-- Corre en el SQL Editor de Supabase. Es mas chico que las cargas de datos
-- anteriores (deberia ser confiable), pero si algo no persiste sin marcar
-- error, avisar para revisar tabla por tabla.

-- 1) Renombrar tablas existentes (no pierde datos) ----------------------------
alter table products         rename to "001_prendas";
alter table product_variants rename to "002_talles";
alter table clientes         rename to "003_clientes";
alter table pedidos          rename to "004_pedidos";
alter table pedido_items     rename to "005_ordenes";
alter table pagos            rename to "006_pagos";
alter table facturas         rename to "007_facturas";
alter table profiles         rename to "012_profiles";

alter table "005_ordenes" rename column product_variant_id to talle_id;

-- 2) Eliminar codigos_descuento -------------------------------------------------
drop table if exists codigos_descuento;

-- 3) Proveedores -----------------------------------------------------------------
create table if not exists "008_proveedores" (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);
alter table "008_proveedores" enable row level security;

-- 4) Compras (reemplaza la hoja "Compras") ---------------------------------------
create table if not exists "009_compras" (
  id uuid primary key default gen_random_uuid(),
  numero text,                              -- "C-001" (agrupa varias lineas de una misma compra)
  fecha date not null,
  proveedor_id uuid references "008_proveedores"(id),
  talle_id uuid references "002_talles"(id),  -- nullable: hay compras viejas de talles ya discontinuados
  sku_original text,                          -- SKU tal cual estaba en el Excel (referencia si talle_id es null)
  cantidad integer not null default 0,
  costo_unitario numeric(12,2) not null default 0,
  estado text not null default 'Entregado',
  created_at timestamptz not null default now()
);
create index if not exists idx_009_compras_talle on "009_compras" (talle_id);
alter table "009_compras" enable row level security;

-- 5) Historico de precios (reemplaza columnas por fecha de "Lista de precios") --
create table if not exists "010_precios" (
  id uuid primary key default gen_random_uuid(),
  talle_id uuid not null references "002_talles"(id),
  precio_lista numeric(12,2) not null,
  precio_transferencia numeric(12,2) not null,
  vigente_desde date not null,
  created_at timestamptz not null default now(),
  unique (talle_id, vigente_desde)
);
create index if not exists idx_010_precios_talle on "010_precios" (talle_id, vigente_desde desc);
alter table "010_precios" enable row level security;

-- 6) Historico de costo de reposicion (reemplaza columnas por fecha) ------------
create table if not exists "011_costos_reposicion" (
  id uuid primary key default gen_random_uuid(),
  talle_id uuid not null references "002_talles"(id),
  costo numeric(12,2) not null,
  vigente_desde date not null,
  created_at timestamptz not null default now(),
  unique (talle_id, vigente_desde)
);
create index if not exists idx_011_costos_talle on "011_costos_reposicion" (talle_id, vigente_desde desc);
alter table "011_costos_reposicion" enable row level security;

-- 7) Migrar los valores actuales de "002_talles" a las tablas historicas --------
insert into "010_precios" (talle_id, precio_lista, precio_transferencia, vigente_desde)
select id, precio_lista, precio_transferencia, current_date
from "002_talles";

insert into "011_costos_reposicion" (talle_id, costo, vigente_desde)
select id, costo, current_date
from "002_talles"
where costo > 0;

-- 8) "002_talles" queda solo con identidad (SKU) --------------------------------
alter table "002_talles" drop column if exists stock;
alter table "002_talles" drop column if exists costo;
alter table "002_talles" drop column if exists precio_transferencia;
alter table "002_talles" drop column if exists precio_lista;

-- 9) Arreglar la funcion de numeracion de pedidos (el "from pedidos" quedo
--    apuntando al nombre viejo tras el rename) ----------------------------------
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
  from "004_pedidos"
  where numero like anio || '-%';
  return anio || '-' || lpad(siguiente::text, 2, '0');
end;
$$;

-- decrement_stock ya no tiene sentido: el stock ahora se calcula solo
-- (compras - ordenes vendidas), no hay contador que descontar.
drop function if exists decrement_stock(text, integer);

-- 10) Vistas calculadas (101+) — nunca se editan a mano --------------------------
create or replace view "101_stock_actual" as
select
  t.id as talle_id,
  coalesce(c.comprado, 0) - coalesce(o.vendido, 0) as stock
from "002_talles" t
left join (
  select talle_id, sum(cantidad) as comprado
  from "009_compras" group by talle_id
) c on c.talle_id = t.id
left join (
  select talle_id, sum(cantidad) as vendido
  from "005_ordenes" group by talle_id
) o on o.talle_id = t.id;

create or replace view "102_precio_vigente" as
select distinct on (talle_id) talle_id, precio_lista, precio_transferencia, vigente_desde
from "010_precios"
where vigente_desde <= current_date
order by talle_id, vigente_desde desc;

create or replace view "103_costo_vigente" as
select distinct on (talle_id) talle_id, costo, vigente_desde
from "011_costos_reposicion"
where vigente_desde <= current_date
order by talle_id, vigente_desde desc;

drop view if exists pedidos_con_saldo;
create or replace view "104_pedidos_con_saldo" as
select
  p.id, p.numero, p.colegio, p.cliente_id, p.forma_pago, p.cargo_envio,
  p.descuento, p.envio, p.estado_envio, p.estado_pago, p.vendedor_id, p.created_at,
  coalesce(items.cant, 0) as cant,
  coalesce(items.monto, 0) as monto,
  coalesce(items.monto, 0) + p.cargo_envio - p.descuento as total_venta,
  coalesce(pagos.monto_pagado, 0) as monto_pagado,
  (coalesce(items.monto, 0) + p.cargo_envio - p.descuento) - coalesce(pagos.monto_pagado, 0) as saldo
from "004_pedidos" p
left join (
  select pedido_id, sum(cantidad) as cant, sum(cantidad * precio_unitario) as monto
  from "005_ordenes" group by pedido_id
) items on items.pedido_id = p.id
left join (
  select pedido_id, sum(monto) as monto_pagado
  from "006_pagos" group by pedido_id
) pagos on pagos.pedido_id = p.id;
