-- Agrega la columna para guardar el link de Drive de cada factura.
-- Corre en el SQL Editor de Supabase (una sola sentencia, sin problema).

alter table "007_facturas" add column if not exists drive_link text;
