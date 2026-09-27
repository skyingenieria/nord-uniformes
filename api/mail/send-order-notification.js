// POST /api/mail/send-order-notification
// Envía email a norduniformes@gmail.com notificando nuevo pedido
// Body: { idPedido, codigoCliente, nombre, apellido, email, items, subtotal, descuento, total, pago, envio }
// También lo reusa el modal "Avisame cuando haya stock" de wellspring.html
// (pago:"avisame") -- no hay función nueva para eso por el límite de 12
// funciones de Vercel Hobby (ver CLAUDE.md), así que nombre/email de
// cualquier visitante anónimo llegan acá sin pasar por el checkout real.

const nodemailer = require("nodemailer");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const { idPedido, codigoCliente, nombre, apellido, email, telefono, pago, envio } = req.body;
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const subtotal = Number(req.body.subtotal) || 0;
    const descuento = Number(req.body.descuento) || 0;
    const total = Number(req.body.total) || 0;

    if (!idPedido || typeof nombre !== "string" || !nombre.trim() || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: "Faltan datos requeridos o el email no es válido" });
    }
    if (!items.length) return res.status(400).json({ error: "El pedido no tiene items" });

    // Configurar transporte SMTP (usar credenciales de variable de entorno)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER || "norduniformes@gmail.com",
        pass: process.env.SMTP_PASS, // App password de Gmail
      },
    });

    // Todo lo que viene del body (nombre, email, nombres de prenda, etc.) se
    // escapa antes de meterlo en el HTML del mail -- este endpoint es público
    // y sin auth, así que nombre/email pueden traer HTML/links armados a
    // mano para intentar phishing en la bandeja de entrada del negocio.
    const itemsHtml = items.map(i => {
      const cant = Number(i.qty) || 0;
      const precio = Number(i.precio) || 0;
      return `<tr><td>${esc(i.nombre)} - Talle ${esc(i.talle)}</td><td>${cant}</td><td>$${precio.toLocaleString("es-AR")}</td><td>$${(precio * cant).toLocaleString("es-AR")}</td></tr>`;
    }).join("");

    const descuentoHtml = descuento > 0 ? `<tr style="color:#2e7d52"><td colspan="3">Descuento (${esc(pago)})</td><td>-$${descuento.toLocaleString("es-AR")}</td></tr>` : "";

    const telDigits = String(telefono || "").replace(/\D/g, "");
    const waNum = telDigits ? (telDigits.startsWith("54") ? telDigits : "549" + telDigits.replace(/^0/, "")) : "";
    const telHtml = telefono
      ? `<p><strong>Teléfono:</strong> ${esc(telefono)}${waNum ? ` — <a href="https://wa.me/${esc(waNum)}">Escribir por WhatsApp</a>` : ""}</p>`
      : "";

    const htmlContent = `
      <h2>Nuevo Pedido #${esc(idPedido)}</h2>
      <p><strong>Cliente:</strong> ${esc(nombre)} ${esc(apellido)} (${esc(codigoCliente)})</p>
      <p><strong>Email:</strong> ${esc(email)}</p>
      ${telHtml}
      <p><strong>Forma de Pago:</strong> ${esc(pago)}</p>
      <p><strong>Envío:</strong> ${esc(envio)}</p>

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
      cc: "flor.cordeviola@hotmail.com",
      replyTo: EMAIL_RE.test(String(email).trim()) ? email.trim() : undefined,
      subject: `Nuevo Pedido #${idPedido} - ${nombre} ${apellido}`,
      html: htmlContent,
    });

    res.json({ success: true, message: "Email enviado" });
  } catch (err) {
    console.error("Error enviando email:", err);
    res.status(500).json({ error: err.message });
  }
};
