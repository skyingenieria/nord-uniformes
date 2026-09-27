-- 015_egresos: registro auxiliar de pagos/aportes extraordinarios (plata que
-- pone Flor o Fede de su bolsillo, o pagos puntuales a proveedores fuera del
-- circuito normal). Es standalone a proposito -- no tiene talle_id, cliente_id
-- ni ningun otro FK, y no participa de ninguna vista calculada (101-104): es
-- solo un registro para que quede history, no afecta stock/ventas/ganancia.
--
-- "compra_ref" y "proveedor" quedan como texto libre (no FK a 008_proveedores
-- ni 009_compras) por el mismo motivo: es un anotador aparte, no se cruza con
-- el resto del sistema.
--
-- Corre en el SQL Editor de Supabase (ver CLAUDE.md, ASCII plano, scripts
-- chicos).

create table if not exists "015_egresos" (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  pagado_por text not null,
  proveedor text,
  compra_ref text,
  moneda text not null default 'ARS' check (moneda in ('ARS','USD')),
  sena numeric,
  por_pagar numeric,
  monto_total numeric not null,
  estado text,
  comentario text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table "015_egresos" enable row level security;

drop policy if exists "app_full_access" on "015_egresos";
create policy "app_full_access" on "015_egresos" for all to authenticated
  using (exists (select 1 from "012_profiles" where id = auth.uid()))
  with check (exists (select 1 from "012_profiles" where id = auth.uid()));
