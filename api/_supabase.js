// Cliente Supabase compartido para las funciones serverless.
// Nombre con "_" al inicio: no cuenta como ruta ante el límite de 12
// funciones de Vercel Hobby (mismo criterio que api/nave/_auth.js).
//
// Usa la service_role key: solo se llama desde el backend (nunca se expone
// al browser), así que ignora RLS y tiene acceso total a las tablas. Hace
// falta cargar SUPABASE_SERVICE_ROLE_KEY en Vercel para que esto funcione
// (SUPABASE_URL no es secreta — ya viaja hardcodeada en gestion.html/
// wellspring.html — así que si no está en las env vars se usa ese
// mismo valor como default).

const { createClient } = require("@supabase/supabase-js");

let client = null;

function supabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL || "https://piaagjddrrcbijienvll.supabase.co";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
      throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno de Vercel");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

// No hace falta descontar stock a mano: 101_stock_actual se recalcula solo
// (compras - ordenes) apenas se inserta en 005_ordenes. Ver CLAUDE.md.

module.exports = { supabase };
