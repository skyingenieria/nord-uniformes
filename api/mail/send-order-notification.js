// POST /api/mail/send-order-notification
// Envía email a norduniformes@gmail.com notificando nuevo pedido
// Body: { idPedido, codigoCliente, nombre, apellido, email, items, subtotal, descuento, total, pago, envio }

const nodemailer = require("nodemailer");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const { idPedido, codigoCliente, nombre, apellido, email, items, subtotal, descuento, total, pago, envio } = req.body;

    if (!idPedido || !nombre || !email) {
      return res.status(400).json({ error: "Faltan datos requeridos" });
    }

    // Configurar transporte SMTP (usar credenciales de variable de entorno)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER || "norduniformes@gmail.com",
        pass: process.env.SMTP_PASS, // App password de Gmail
      },
    });

    // Construir HTML del email
    const itemsHtml = items.map(i =>
      `<tr><td>${i.nombre} - Talle ${i.talle}</td><td>${i.qty}</td><td>$${i.precio.toLocaleString("es-AR")}</td><td>$${(i.precio * i.qty).toLocaleString("es-AR")}</td></tr>`
    ).join("");

    const descuentoHtml = descuento > 0 ? `<tr style="color:#2e7d52"><td colspan="3">Descuento (${pago})</td><td>-$${descuento.toLocaleString("es-AR")}</td></tr>` : "";

    const htmlContent = `
      <h2>Nuevo Pedido #${idPedido}</h2>
      <p><strong>Cliente:</strong> ${nombre} ${apellido} (${codigoCliente})</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Forma de Pago:</strong> ${pago}</p>
      <p><strong>Envío:</strong> ${envio}</p>

      <h3>Detalle de Prendas:</h3>
      <table style="border-collapse:collapse;width:100%">
        <tr style="background:#f0f0f0">
          <th style="border:1px solid #ccc;padding:8px;text-align:left">Prenda</th>
          <th style="border:1px solid #ccc;padding:8px;text-align:center">Cant</th>
          <th style="border:1px solid #ccc;padding:8px;text-align:right">Precio Unit.</th>
          <th style="border:1px solid #ccc;padding:8px;text-align:right">Total</th>
        </tr>
        ${itemsHtml}
        <tr style="border-top:2px solid #ccc;font-weight:bold">
          <td colspan="3" style="border:1px solid #ccc;padding:8px;text-align:right">Subtotal:</td>
          <td style="border:1px solid #ccc;padding:8px;text-align:right">$${subtotal.toLocaleString("es-AR")}</td>
        </tr>
        ${descuentoHtml}
        <tr style="background:#e8f5e9;font-weight:bold;font-size:16px">
          <td colspan="3" style="border:1px solid #ccc;padding:8px;text-align:right">TOTAL:</td>
          <td style="border:1px solid #ccc;padding:8px;text-align:right">$${total.toLocaleString("es-AR")}</td>
        </tr>
      </table>
      <p style="margin-top:20px;color:#666"><small>Pedido generado automaticamente desde la tienda online</small></p>
    `;

    // Enviar email
    await transporter.sendMail({
      from: process.env.SMTP_USER || "norduniformes@gmail.com",
      to: "norduniformes@gmail.com",
      subject: `Nuevo Pedido #${idPedido} - ${nombre} ${apellido}`,
      html: htmlContent,
    });

    res.json({ success: true, message: "Email enviado" });
  } catch (err) {
    console.error("Error enviando email:", err);
    res.status(500).json({ error: err.message });
  }
};
