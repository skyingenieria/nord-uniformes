/* Generador VECTORIAL de la Factura C con jsPDF (sin html2canvas).
   Se ve idéntico en cualquier dispositivo y nunca sale en blanco.
   Expone window.NORD_FACTURA_PDF.generate(data) -> { blob, filename }.
   data: { cuit, ptoVta, nroCmp, tipoCmp, fechaISO?, fechaYMD?, cae, caeVto,
           importe, receptorTipo, receptorNro, cliente, id, items?, ambiente, qrUrl } */
(function (global) {
  const INK = [15, 23, 46], GREY = [90, 90, 90], LINE = [201, 205, 214], HEAD = [240, 241, 244], RED = [161, 42, 42];

  const money = n => "$ " + (Math.round((Number(n) || 0) * 100) / 100)
    .toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad = (v, n) => String(v || 0).padStart(n, "0");
  const cuitFmt = c => { const s = String(c || "").replace(/\D/g, ""); return s.length === 11 ? `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}` : String(c || ""); };
  const ymd2ar = s => { s = String(s || ""); return s.length === 8 ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : (s || "—"); };
  const iso2ar = s => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || "—"); };
  function fechaYMD(d) {
    if (d.fechaYMD && String(d.fechaYMD).length === 8) return String(d.fechaYMD);
    const m = String(d.fechaISO || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + m[2] + m[3] : "";
  }
  function filename(d) {
    const ymd = fechaYMD(d), y = ymd.slice(0, 4) || "0000", mo = ymd.slice(4, 6) || "00";
    const nro = String(d.nroCmp || 0).padStart(3, "0").slice(-3); // últimos 3 dígitos, sin punto de venta
    return `NRD-${y}-${mo}-${nro}-${Math.round(Number(d.importe) || 0)}.pdf`;
  }
  function receptor(tipo, nro) {
    tipo = Number(tipo);
    if (tipo === 99 || !nro) return "Consumidor Final";
    if (tipo === 80) return "CUIT " + cuitFmt(nro);
    if (tipo === 96) return "DNI " + String(nro);
    return String(nro || "");
  }

  // QR -> data URL PNG dibujado en un canvas nativo (no html2canvas).
  function qrPng(qrUrl, px) {
    if (!global.qrcode || !qrUrl) return null;
    const q = global.qrcode(0, "M"); q.addData(qrUrl); q.make();
    const n = q.getModuleCount();
    const cell = Math.max(2, Math.floor((px || 300) / n));
    const size = cell * n;
    const c = document.createElement("canvas"); c.width = size; c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (q.isDark(r, col)) ctx.fillRect(col * cell, r * cell, cell, cell);
    return c.toDataURL("image/png");
  }

  function generate(data) {
    const JsPDF = global.jspdf && global.jspdf.jsPDF;
    if (!JsPDF) throw new Error("jsPDF no disponible");
    const doc = new JsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const PW = doc.internal.pageSize.getWidth();
    const M = 36, x0 = M, x1 = PW - M, W = x1 - x0;
    const setInk = c => doc.setTextColor(c[0], c[1], c[2]);
    const setDraw = c => doc.setDrawColor(c[0], c[1], c[2]);
    const setFill = c => doc.setFillColor(c[0], c[1], c[2]);

    let y = M;
    const esPrueba = /homolog/i.test(data.ambiente || "");
    if (esPrueba) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); setInk(RED);
      doc.text("COMPROBANTE DE PRUEBA — SIN VALIDEZ FISCAL (homologación)", PW / 2, y + 4, { align: "center" });
      y += 16;
    }

    // ── Encabezado (emisor | C | comprobante) ──
    const headH = 96, sideW = (W - 54) / 2, midW = 54;
    const emX = x0, cX = x0 + sideW, docX = x0 + sideW + midW;
    setDraw(INK); doc.setLineWidth(1.2);
    doc.roundedRect(x0, y, W, headH, 4, 4, "S");
    doc.line(cX, y, cX, y + headH);
    doc.line(docX, y, docX, y + headH);

    // Emisor
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); setInk(INK);
    doc.text("NORD Uniformes", emX + 12, y + 22);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); setInk(GREY);
    doc.text("Cordeviola Florencia · Responsable Monotributo", emX + 12, y + 36);
    doc.setFontSize(9.5); setInk(INK);
    doc.text("CUIT: ", emX + 12, y + 52);
    const cuitLblW = doc.getTextWidth("CUIT: ");
    doc.setFont("helvetica", "bold"); doc.text(cuitFmt(data.cuit), emX + 12 + cuitLblW, y + 52);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); setInk(GREY);
    doc.text("Av. Santa Fe 3354, Piso 5 A — CABA", emX + 12, y + 66);
    doc.text("Punto de Venta: " + pad(data.ptoVta, 5), emX + 12, y + 79);

    // Letra C
    doc.setFont("helvetica", "bold"); doc.setFontSize(30); setInk(INK);
    doc.text("C", cX + midW / 2, y + 44, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); setInk(GREY);
    doc.text("COD. " + (data.tipoCmp || 11), cX + midW / 2, y + 58, { align: "center" });

    // Comprobante
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); setInk(INK);
    doc.text("FACTURA", x1 - 12, y + 24, { align: "right" });
    const comp = pad(data.ptoVta, 5) + "-" + pad(data.nroCmp, 8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); setInk(GREY);
    doc.text("Comprobante N°", docX + 10, y + 44);
    doc.text("Fecha de emisión", docX + 10, y + 60);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); setInk(INK);
    doc.text(comp, x1 - 12, y + 44, { align: "right" });
    const fISO = data.fechaISO || (() => { const yy = fechaYMD(data); return yy ? `${yy.slice(0, 4)}-${yy.slice(4, 6)}-${yy.slice(6, 8)}` : ""; })();
    doc.text(iso2ar(fISO), x1 - 12, y + 60, { align: "right" });

    y += headH + 12;

    // ── Datos del cliente ──
    const secH = 56;
    setDraw(LINE); doc.setLineWidth(1);
    doc.roundedRect(x0, y, W, secH, 4, 4, "S");
    const rows = [
      ["Cliente", data.cliente || "—", true],
      ["Condición / Documento", receptor(data.receptorTipo, data.receptorNro), false],
      ["Condición de venta", "Contado", false],
    ];
    let ry = y + 18;
    rows.forEach(r => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); setInk(GREY);
      doc.text(r[0], x0 + 12, ry);
      doc.setFont("helvetica", r[2] ? "bold" : "normal"); setInk(INK);
      doc.text(String(r[1]), x0 + 150, ry);
      ry += 16;
    });
    y += secH + 16;

    // ── Tabla de ítems ──
    const cSub = x1 - 8, cPU = x1 - 100, cCant = x1 - 190, cDesc = x0 + 8;
    doc.setFillColor(HEAD[0], HEAD[1], HEAD[2]);
    doc.rect(x0, y, W, 22, "F");
    setDraw(INK); doc.setLineWidth(1.2); doc.line(x0, y + 22, x1, y + 22);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); setInk(INK);
    doc.text("DESCRIPCIÓN", cDesc, y + 14);
    doc.text("CANT.", cCant, y + 14, { align: "right" });
    doc.text("P. UNIT.", cPU, y + 14, { align: "right" });
    doc.text("SUBTOTAL", cSub, y + 14, { align: "right" });
    y += 22;

    let items = Array.isArray(data.items) && data.items.length ? data.items : null;
    if (!items) items = [{ n: "Venta de indumentaria" + (data.id ? " — Pedido " + data.id : ""), t: "", q: 1, p: data.importe }];
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); setInk(INK);
    items.forEach(it => {
      const rowH = 24;
      const desc = String(it.n || "") + (it.t ? " — Talle " + it.t : "");
      const q = Number(it.q) || 0, p = Number(it.p) || 0;
      doc.text(doc.splitTextToSize(desc, cCant - cDesc - 40)[0] || desc, cDesc, y + 16);
      doc.text(String(q), cCant, y + 16, { align: "right" });
      doc.text(money(p), cPU, y + 16, { align: "right" });
      doc.text(money(p * q), cSub, y + 16, { align: "right" });
      setDraw(LINE); doc.setLineWidth(0.7); doc.line(x0, y + rowH, x1, y + rowH);
      y += rowH;
    });

    // ── Total ──
    y += 8;
    setDraw(INK); doc.setLineWidth(1.2); doc.line(cCant - 20, y, x1, y);
    y += 20;
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); setInk(INK);
    doc.text("Total", cCant - 20, y, { align: "left" });
    doc.text(money(data.importe), cSub, y, { align: "right" });
    y += 24;

    // ── Pie: QR + CAE ──
    setDraw(LINE); doc.setLineWidth(0.7);
    doc.setLineDashPattern([2, 2], 0); doc.line(x0, y, x1, y); doc.setLineDashPattern([], 0);
    y += 14;
    const qrSize = 96;
    try { const png = qrPng(data.qrUrl, 320); if (png) doc.addImage(png, "PNG", x0, y, qrSize, qrSize); } catch (e) { }
    const tx = x0 + qrSize + 16;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); setInk(INK);
    doc.text("Comprobante Autorizado", tx, y + 12);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); setInk(GREY);
    doc.text("CAE N°", tx, y + 30);
    doc.text("Fecha Vto. CAE", tx, y + 46);
    doc.setFont("helvetica", "bold"); setInk(INK);
    doc.text(String(data.cae || "—"), tx + 90, y + 30);
    doc.text(ymd2ar(data.caeVto), tx + 90, y + 46);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); setInk(GREY);
    doc.text("Verificá este comprobante en afip.gob.ar", tx, y + 64);

    return { blob: doc.output("blob"), filename: filename(data) };
  }

  global.NORD_FACTURA_PDF = { generate, filename };
})(window);
