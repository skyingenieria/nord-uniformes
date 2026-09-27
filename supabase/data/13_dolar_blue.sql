-- 014_dolar_blue: cotizacion diaria del dolar blue (compra/venta/promedio),
-- para convertir ventas y ganancia a USD en el Dashboard de gestion.html.
-- Se carga con historico desde la primera venta real (2026-06-08) usando
-- api.argentinadatos.com (dolarapi.com no tiene endpoint historico, solo
-- valor del dia -- se usa para completar dias nuevos going forward).
--
-- "promedio" es columna generada (compra+venta)/2, redondeada a 2
-- decimales -- nunca se inserta a mano, se calcula sola.
--
-- Corre en el SQL Editor de Supabase (ver CLAUDE.md, ASCII plano, scripts
-- chicos).

create table if not exists "014_dolar_blue" (
  fecha date primary key,
  compra numeric not null,
  venta numeric not null,
  promedio numeric generated always as (round((compra + venta) / 2.0, 2)) stored,
  created_at timestamptz not null default now()
);

alter table "014_dolar_blue" enable row level security;

drop policy if exists "app_full_access" on "014_dolar_blue";
create policy "app_full_access" on "014_dolar_blue" for all to authenticated
  using (exists (select 1 from "012_profiles" where id = auth.uid()))
  with check (exists (select 1 from "012_profiles" where id = auth.uid()));
