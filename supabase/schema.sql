-- Nord Uniformes — Etapa 1 de migración a Supabase: catálogo (prendas, talles, stock, precios).
-- Reemplaza las hojas 'Stock', 'Lista de precios' y 'Listado de Prendas' del Sheet ERP.
-- Clientes, Pedidos, Ordenes, Facturas y Codigos siguen en Google Sheets (próximas etapas).
--
-- Correr una sola vez en el SQL Editor de Supabase (Project → SQL Editor → New query).

create extension if not exists pgcrypto;

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  colegio text not null,
  slug text not null,
  nombre text not null,
  descripcion text not null default '',
  genero text not null default '',
  categorias text[] not null default '{}',
  foto1 text not null default '',
  foto2 text not null default '',
  updated_at timestamptz not null default now(),
  unique (colegio, slug)
);

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  talle text not null,
  sku text not null unique,
  stock integer not null default 0,
  costo numeric(12,2) not null default 0,
  precio_transferencia numeric(12,2) not null default 0,
  precio_lista numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (product_id, talle)
);

create index if not exists product_variants_product_id_idx on product_variants (product_id);
create index if not exists products_colegio_idx on products (colegio);

-- Descuenta stock al confirmar una venta. Nunca baja de 0 (evita stock negativo
-- si dos ventas se procesan casi al mismo tiempo).
create or replace function decrement_stock(p_sku text, p_qty integer)
returns void
language sql
as $$
  update product_variants
  set stock = greatest(stock - p_qty, 0), updated_at = now()
  where sku = p_sku;
$$;

-- RLS habilitado sin policies: solo la service_role key (usada desde las
-- funciones serverless de Vercel) puede leer/escribir. La anon key nunca
-- se expone al browser para estas tablas, así que quedan bloqueadas por default.
alter table products enable row level security;
alter table product_variants enable row level security;
