// Cliente Supabase compartido para las funciones serverless.
// Nombre con "_" al inicio: no cuenta como ruta ante el límite de 12
// funciones de Vercel Hobby (mismo criterio que api/nave/_auth.js).
//
// Usa la service_role key: solo se llama desde el backend (nunca se expone
// al browser), así que ignora RLS y tiene acceso total a las tablas.

const { createClient } = require("@supabase/supabase-js");

let client = null;

function supabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

// Descuenta stock al confirmar una venta. Resuelve la SKU por
// (colegio, nombre, talle) y descuenta vía RPC atómica (ver decrement_stock
// en supabase/schema.sql). Best-effort: nunca debe bloquear una venta.
async function decrementStock(colegio, nombre, talle, qty) {
  try {
    const sb = supabase();
    const { data: prod, error: prodErr } = await sb
      .from("products").select("id")
      .eq("colegio", colegio).eq("nombre", nombre).maybeSingle();
    if (prodErr || !prod) return;
    const { data: variant, error: varErr } = await sb
      .from("product_variants").select("sku")
      .eq("product_id", prod.id).eq("talle", String(talle)).maybeSingle();
    if (varErr || !variant) return;
    await sb.rpc("decrement_stock", { p_sku: variant.sku, p_qty: Number(qty) || 1 });
  } catch (e) {
    console.error("No se pudo descontar stock en Supabase:", e.message);
  }
}

module.exports = { supabase, decrementStock };
