-- RLS para que la web app nueva (Etapa 2) hable directo con Supabase desde
-- el browser, usando Supabase Auth. Sin esto, con RLS habilitado y cero
-- policies (como quedo en el rediseño), nadie puede leer ni escribir nada
-- salvo la service_role key.
--
-- Criterio v1 (simple a proposito): cualquier usuario logueado que tenga
-- una fila en "012_profiles" (sin importar el rol admin/vendedor) puede
-- leer y escribir las tablas de negocio 001-011. Restricciones mas finas
-- por rol (por ej. que un vendedor no pueda borrar clientes, o no pueda
-- tocar precios) se agregan despues si hace falta, una vez que la app
-- este andando.
--
-- Corre en el SQL Editor de Supabase.

do $$
declare
  t text;
begin
  foreach t in array array[
    '001_prendas','002_talles','003_clientes','004_pedidos','005_ordenes',
    '006_pagos','007_facturas','008_proveedores','009_compras',
    '010_precios','011_costos_reposicion'
  ]
  loop
    execute format(
      'drop policy if exists "app_full_access" on %I;', t
    );
    execute format(
      'create policy "app_full_access" on %I for all to authenticated using (exists (select 1 from "012_profiles" where id = auth.uid())) with check (exists (select 1 from "012_profiles" where id = auth.uid()));',
      t
    );
  end loop;
end $$;

-- Las vistas 101-104 no tienen RLS propio (son solo lectura, no tablas),
-- pero necesitan que el rol "authenticated" pueda hacer SELECT sobre ellas.
grant select on "101_stock_actual"    to authenticated;
grant select on "102_precio_vigente"  to authenticated;
grant select on "103_costo_vigente"   to authenticated;
grant select on "104_pedidos_con_saldo" to authenticated;
