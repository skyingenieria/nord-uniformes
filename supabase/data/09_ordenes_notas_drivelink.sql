-- Corre en el SQL Editor de Supabase, de una sola vez.
-- Junta 3 cambios pendientes pedidos por Flor el 2026-09-27.

-- 1) Link de Drive por factura (venia pendiente de la sesion anterior de
--    gestion.html -- el codigo ya lo usa, solo faltaba esta columna).
alter table "007_facturas" add column if not exists drive_link text;

-- 2) Descuento % guardado por linea de orden, en vez de recalcularlo en vivo
--    contra el precio vigente de HOY (que cambia con el tiempo). Nullable
--    a proposito: las filas viejas quedan en NULL y gestion.html les sigue
--    estimando el % en vivo como hacia antes; las filas nuevas siempre
--    mandan un valor (0 si no hay descuento).
alter table "005_ordenes" add column if not exists descuento_pct numeric;

-- 3) Nota libre por pedido.
alter table "004_pedidos" add column if not exists notas text;

-- 4) La vista de pedidos con saldo lista columnas explicitas (no select *),
--    asi que hay que agregarle "notas" a mano para que gestion.html la lea.
create or replace view "104_pedidos_con_saldo" as
select
  p.id, p.numero, p.colegio, p.cliente_id, p.forma_pago, p.cargo_envio,
  p.descuento, p.envio, p.estado_envio, p.estado_pago, p.vendedor_id, p.created_at, p.notas,
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
