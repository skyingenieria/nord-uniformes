// POST /api/nave/create-payment — crea intención de pago en Nave
// Body: { orderId, total, nombreCliente, email, telefono, items }

const getAccessToken = require("./auth");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const { orderId, total, nombreCliente, email, telefono, items } = req.body;

    if (!orderId || !total || !items) {
      return res.status(400).json({ error: "Faltan datos requeridos" });
    }

    const token = await getAccessToken();
    const baseUrl = process.env.NAVE_ENV === "prod"
      ? "https://api.ranty.io/api/payment_request/ecommerce"
      : "https://api-sandbox.ranty.io/api/payment_request/ecommerce";

    const payload = {
      external_payment_id: orderId,
      seller: {
        pos_id: process.env.NAVE_POS_ID,
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
        name: nombreCliente,
        user_email: email,
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
