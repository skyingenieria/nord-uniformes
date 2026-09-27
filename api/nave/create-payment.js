// POST /api/nave/create-payment — crea intención de pago en Nave
// Body: { orderId, total, nombreCliente, email, telefono, items }

const getAccessToken = require("./_auth");
const { supabase } = require("../_supabase");

// El "total" y el precio de cada ítem que manda el body NO se confían tal
// cual: el carrito vive en localStorage (editable por consola) y cualquiera
// podría bajar un precio antes de tocar "Pagar con tarjeta". Cuando orderId
// es el uuid de un pedido real de Supabase (siempre, desde carrito.html y
// gestion.html Vender), se ignora el total/precios del body y se cobra lo
// que dice 104_pedidos_con_saldo/005_ordenes en el servidor -- misma idea
// que ya usa api/orders.js para no confiar en precios del cliente.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const { orderId, nombreCliente, email, telefono } = req.body;
    let { total, items } = req.body;

    if (!orderId || !total || !items) {
      return res.status(400).json({ error: "Faltan datos requeridos" });
    }

    if (UUID_RE.test(String(orderId))) {
      const sb = supabase();
      const [{ data: pedido, error: eP }, { data: ordenes, error: eO }] = await Promise.all([
        sb.from("104_pedidos_con_saldo").select("total_venta").eq("id", orderId).maybeSingle(),
        sb.from("005_ordenes").select("nombre_prenda,talle,cantidad,precio_unitario").eq("pedido_id", orderId),
      ]);
      if (eP) throw eP; if (eO) throw eO;
      if (!pedido || !ordenes || !ordenes.length) {
        return res.status(404).json({ error: "No se encontró el pedido para generar el cobro" });
      }
      total = Number(pedido.total_venta) || 0;
      items = ordenes.map(o => ({ nombre: o.nombre_prenda, talle: o.talle, qty: o.cantidad, precio: Number(o.precio_unitario) || 0 }));
    }

    // Nave exige un email de comprador. Si el cliente no tiene uno válido
    // cargado (venta armada desde la app), se usa un email de respaldo del
    // negocio para que el link igual se genere.
    const emailValido = typeof email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
    const buyerEmail = emailValido
      ? email.trim()
      : (process.env.NAVE_FALLBACK_EMAIL || process.env.SMTP_USER || "norduniformes@gmail.com");

    const token = await getAccessToken();
    const baseUrl = process.env.NAVE_ENV === "prod"
      ? "https://api.ranty.io/api/payment_request/ecommerce"
      : "https://api-sandbox.ranty.io/api/payment_request/ecommerce";

    const payload = {
      external_payment_id: orderId,
      seller: {
        pos_id: (process.env.NAVE_POS_ID || "").replace(/﻿/g, "").trim(),
      },
      transactions: [
        {
          amount: {
            currency: "ARS",
            value: String(total.toFixed(2)),
          },
          products: items.map(i => ({
            name: i.nombre,
            description: `Talle ${i.talle}`,
            quantity: Number(i.qty),
            unit_price: {
              currency: "ARS",
              value: String(i.precio.toFixed(2)),
            },
          })),
        },
      ],
      buyer: {
        name: nombreCliente || "Cliente",
        user_email: buyerEmail,
        phone: telefono ? `+54${telefono.replace(/\D/g, "")}` : undefined,
      },
      additional_info: {
        callback_url: process.env.NAVE_CALLBACK_URL || "https://norduniformes.com.ar/confirmacion",
      },
      duration_time: 3600, // 1 hora
    };

    const r = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("Nave error response:", errText);
      console.error("Nave error status:", r.status);
      console.error("Payload sent:", JSON.stringify(payload, null, 2));
      try {
        const errJson = JSON.parse(errText);
        return res.status(r.status).json({ error: "Error creando intención de pago", details: errJson });
      } catch {
        return res.status(r.status).json({ error: "Error creando intención de pago", details: errText });
      }
    }

    const data = await r.json();
    res.json({
      success: true,
      payment_request_id: data.id,
      checkout_url: data.checkout_url,
      qr_data: data.qr_data,
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  }
};
