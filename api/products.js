// Lee el catálogo (prendas + talles/stock/precios) desde Supabase.
// Reemplaza la lectura directa de las hojas 'Stock', 'Lista de precios' y
// 'Listado de Prendas' del Sheet ERP (ver supabase/schema.sql y
// scripts/migrate-catalogo-to-supabase.js). Devuelve exactamente el mismo
// shape que antes para no tener que tocar wellspring.html / carrito.html.

const { supabase } = require("./_supabase");

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

function talleSort(a, b) {
  const na = Number(a.talle);
  const nb = Number(b.talle);
  const aIsNum = !isNaN(na) && a.talle.trim() !== '';
  const bIsNum = !isNaN(nb) && b.talle.trim() !== '';
  if (aIsNum && bIsNum) return na - nb;
  if (aIsNum) return -1;
  if (bIsNum) return 1;
  const ai = SIZE_ORDER.indexOf(a.talle.toUpperCase());
  const bi = SIZE_ORDER.indexOf(b.talle.toUpperCase());
  if (ai !== -1 && bi !== -1) return ai - bi;
  return a.talle.localeCompare(b.talle);
}

async function fetchFromSupabase(colegio = "WS") {
  const sb = supabase();
  const { data, error } = await sb
    .from("products")
    .select(`
      slug, nombre, descripcion, genero, categorias, foto1, foto2,
      product_variants ( talle, stock, precio_transferencia, precio_lista )
    `)
    .eq("colegio", colegio);

  if (error) throw new Error(error.message);

  const products = (data || []).map(p => {
    const talles = (p.product_variants || [])
      .map(v => ({
        talle: String(v.talle),
        stock: Math.round(Number(v.stock) || 0),
        precio: Math.round(Number(v.precio_transferencia) || 0),
        precioLista: Math.round(Number(v.precio_lista) || 0),
      }))
      .sort(talleSort);

    // Precio de referencia de la prenda = el del talle más barato con precio > 0
    // (mismo criterio que la versión que leía de Sheets).
    const conPrecio = talles.filter(t => t.precio > 0);
    const base = conPrecio.length
      ? conPrecio.reduce((min, t) => (t.precio < min.precio ? t : min))
      : { precio: 0, precioLista: 0 };

    const fotos = [p.foto1, p.foto2].map(f => (f || "").trim()).filter(Boolean);

    return {
      id: p.slug,
      nombre: p.nombre,
      precio: base.precio,
      precioLista: base.precioLista,
      imagen_url: fotos[0] || "",
      fotos,
      genero: p.genero || "",
      categorias: p.categorias || [],
      descripcion: p.descripcion || "",
      talles,
    };
  });

  return products;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");

  try {
    const now = Date.now();
    if (!cache || now - cacheTime > CACHE_TTL) {
      cache = await fetchFromSupabase();
      cacheTime = now;
    }
    res.status(200).json(cache);
  } catch (err) {
    console.error("Error leyendo catálogo de Supabase:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};
