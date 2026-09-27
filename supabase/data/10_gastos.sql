-- 013_gastos: gastos operativos que antes se anotaban en un Sheet aparte
-- (logistica, bolsas, software, impuestos, etc). Tabla madre nueva, no
-- reemplaza ninguna de las 001-012 existentes -- sigue la numeracion de
-- Flor (2026-09-26): 001-0xx = tablas madre.
--
-- Sin talle_id/producto: es gasto general del negocio, no de una prenda.
-- "categoria" queda como texto libre (no enum) para no tener que migrar
-- schema cada vez que aparece una categoria nueva -- gestion.html sugiere
-- las usadas hasta ahora en un datalist, pero se puede tipear cualquiera.
--
-- Corre en el SQL Editor de Supabase (ver CLAUDE.md, "Como se hizo el SQL
-- Editor de Supabase confiable" -- script chico, ASCII plano).

create table if not exists "013_gastos" (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  categoria text not null,
  monto numeric not null check (monto > 0),
  proveedor text,
  descripcion text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table "013_gastos" enable row level security;

drop policy if exists "app_full_access" on "013_gastos";
create policy "app_full_access" on "013_gastos" for all to authenticated
  using (exists (select 1 from "012_profiles" where id = auth.uid()))
  with check (exists (select 1 from "012_profiles" where id = auth.uid()));
