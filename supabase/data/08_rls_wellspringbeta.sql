-- Lectura publica (anon, sin login) del catalogo para wellspringbeta.html.
-- Solo estas 2 tablas y las 2 vistas de stock/precio vigente quedan
-- expuestas a "anon" -- nada mas del negocio (clientes, pedidos, pagos,
-- facturas, compras, costos) es visible sin autenticarse.
-- Corre en el SQL Editor de Supabase.

create policy "public_read_prendas" on "001_prendas" for select to anon using (true);
create policy "public_read_talles" on "002_talles" for select to anon using (true);
grant select on "101_stock_actual" to anon;
grant select on "102_precio_vigente" to anon;
