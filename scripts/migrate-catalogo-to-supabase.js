// Migración única: copia 'Stock', 'Lista de precios' y 'Listado de Prendas'
// del Sheet ERP a las tablas de Supabase (ver supabase/schema.sql).
//
// Uso:
//   1) Correr supabase/schema.sql en el SQL Editor de Supabase.
//   2) Completar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local
//      (junto a las vars de Google Sheets que ya usa el proyecto).
//   3) node scripts/migrate-catalogo-to-supabase.js
//
// Es re-corrible: hace upsert por (colegio, slug) y (product_id, talle), así
// que se puede volver a ejecutar para traer cambios hechos en el Sheet
// mientras dure la transición.

require("dotenv").config({ path: ".env.local" });
const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");

function slugify(nombre) {
  return nombre
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[áàä]/g, "a").replace(/[éèë]/g, "e").replace(/[íìï]/g, "i")
    .replace(/[óòö]/g, "o").replace(/[úùü]/g, "u")
    .replace(/[^a-z0-9-]/g, "");
}

function makeSheetsAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY
        ?.replace(/\\n/g, "\n").replace(/^"/, "").replace(/"$/, ""),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

async function readSheets() {
  const auth = makeSheetsAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sid = process.env.SPREADSHEET_ID;

  const [stockRes, preciosRes, catRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: sid, range: "'Stock'!A2:J5000", valueRenderOption: "UNFORMATTED_VALUE" }),
    sheets.spreadsheets.values.get({ spreadsheetId: sid, range: "'Lista de precios'!A2:G5000", valueRenderOption: "UNFORMATTED_VALUE" }),
    sheets.spreadsheets.values.get({ spreadsheetId: sid, range: "'Listado de Prendas'!A2:I5000", valueRenderOption: "FORMATTED_VALUE" }),
  ]);

  const isHeader = (colegio, nombre, sku) =>
    colegio === "Colegio" || nombre === "Prenda" || sku === "SKU";

  // Precios por SKU: F(5)=Precio Lista (tarjeta) · G(6)=Precio Trans · E(4)=Costo
  const precioMap = {}, listaMap = {}, costoMap = {};
  for (const r of (preciosRes.data.values || [])) {
    const sku = String(r[3] || "").trim();
    if (!sku) continue;
    const lista = Math.round(Number(r[5]) || 0);
    const trans = Math.round(Number(r[6]) || 0);
    const c = Math.round(Number(r[4]) || 0);
    if (trans || lista) precioMap[sku] = trans || lista;
    if (lista || trans) listaMap[sku] = lista || trans;
    if (c) costoMap[sku] = c;
  }

  // Meta por prenda: foto (H=7), genero (F=5), categorias (E=4, separadas por coma)
  const metaMap = {};
  for (const r of (catRes.data.values || [])) {
    const nombre = String(r[1] || "").trim();
    if (!nombre || nombre === "Prenda") continue;
    if (!metaMap[nombre]) metaMap[nombre] = { fotos: [], genero: "", cats: new Set(), descripcion: "" };
    const m = metaMap[nombre];
    const foto1 = String(r[7] || "").trim();
    const foto2 = String(r[8] || "").trim();
    if (foto1 && !m.fotos.includes(foto1)) m.fotos.push(foto1);
    if (foto2 && !m.fotos.includes(foto2)) m.fotos.push(foto2);
    const gen = String(r[5] || "").trim();
    if (gen && !m.genero) m.genero = gen;
    const desc = String(r[6] || "").trim();
    if (desc && !m.descripcion) m.descripcion = desc;
    String(r[4] || "").split(",").map(c => c.trim()).filter(Boolean).forEach(c => m.cats.add(c));
  }

  // Productos + variantes desde Stock
  const productsMap = {}; // "colegio||nombre" -> { colegio, nombre, meta, variants: [] }
  for (const r of (stockRes.data.values || [])) {
    const colegio = String(r[0] || "").trim();
    const nombre = String(r[1] || "").trim();
    const sku = String(r[3] || "").trim();
    let talle = String(r[2] ?? "").trim();
    if (!talle && sku) talle = sku.split("-").pop();
    if (!nombre || !talle || !sku) continue;
    if (isHeader(colegio, nombre, sku)) continue;

    const key = `${colegio}||${nombre}`;
    if (!productsMap[key]) {
      productsMap[key] = { colegio, nombre, meta: metaMap[nombre] || { fotos: [], genero: "", cats: new Set(), descripcion: "" }, variants: [] };
    }
    const stock = Math.round(Number(r[7]) || 0);
    const precio = precioMap[sku] || Math.round(Number(r[9]) || 0);
    const precioLista = listaMap[sku] || precio;
    const costo = costoMap[sku] || Math.round(Number(r[8]) || 0);
    productsMap[key].variants.push({ talle, sku, stock, costo, precio_transferencia: precio, precio_lista: precioLista });
  }

  return Object.values(productsMap);
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (agregalas a .env.local)");
    process.exit(1);
  }
  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  console.log("Leyendo Sheet ERP...");
  const productos = await readSheets();
  console.log(`${productos.length} prendas encontradas (todas las colegios).`);

  let productosOk = 0, variantesOk = 0;
  for (const p of productos) {
    const slug = slugify(p.nombre);
    const { data: prodRow, error: prodErr } = await sb
      .from("products")
      .upsert({
        colegio: p.colegio,
        slug,
        nombre: p.nombre,
        descripcion: p.meta.descripcion || "",
        genero: p.meta.genero || "",
        categorias: [...p.meta.cats],
        foto1: p.meta.fotos[0] || "",
        foto2: p.meta.fotos[1] || "",
        updated_at: new Date().toISOString(),
      }, { onConflict: "colegio,slug" })
      .select("id")
      .single();

    if (prodErr) {
      console.error(`✗ ${p.colegio} / ${p.nombre}:`, prodErr.message);
      continue;
    }
    productosOk++;

    const variantRows = p.variants.map(v => ({
      product_id: prodRow.id,
      talle: v.talle,
      sku: v.sku,
      stock: v.stock,
      costo: v.costo,
      precio_transferencia: v.precio_transferencia,
      precio_lista: v.precio_lista,
      updated_at: new Date().toISOString(),
    }));
    const { error: varErr } = await sb
      .from("product_variants")
      .upsert(variantRows, { onConflict: "product_id,talle" });

    if (varErr) {
      console.error(`  ✗ talles de ${p.nombre}:`, varErr.message);
      continue;
    }
    variantesOk += variantRows.length;
  }

  console.log(`Listo: ${productosOk} prendas y ${variantesOk} talles migrados a Supabase.`);
}

main().catch(err => {
  console.error("Error en la migración:", err);
  process.exit(1);
});
