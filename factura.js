/* Renderizador compartido del comprobante (Factura C) para /comprobante y la app.
   Expone window.NORD_FACTURA con build(data), drawQR(el,url), parseQr(url), filename(data). */
(function (global) {
  const FANTASIA = "NORD Uniformes";
  const RAZON = "Cordeviola Florencia";
  const COND  = "Responsable Monotributo";
  const DOMICILIO = "Av. Santa Fe 3354, Piso 5 A — CABA";

  const fmt = n => "$ " + (Math.round((Number(n) || 0) * 100) / 100)
    .toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (v, n) => String(v || 0).padStart(n, "0");
  const ymd2ar = s => { s = String(s || ""); return s.length === 8 ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : (s || "—"); };
  const iso2ar = s => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || "—"); };
  const cuitFmt = c => { const s = String(c || "").replace(/\D/g, ""); return s.length === 11 ? `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}` : s; };
  function receptor(tipo, nro) {
    tipo = Number(tipo);
    if (tipo === 99 || !nro) return "Consumidor Final";
    if (tipo === 80) return "CUIT " + cuitFmt(nro);
    if (tipo === 96) return "DNI " + String(nro);
    return String(nro);
  }

  // Payload fiscal desde la URL del QR de AFIP.
  function parseQr(qrUrl) {
    const p = new URL(qrUrl).searchParams.get("p");
    return JSON.parse(atob(p));
  }

  // data: { cuit, ptoVta, nroCmp, tipoCmp, fechaYMD? , fechaISO?, cae, caeVto,
  //         importe, receptorTipo, receptorNro, cliente, id, items?, ambiente, qrUrl }
  function fechaYMD(data) {
    if (data.fechaYMD && String(data.fechaYMD).length === 8) return String(data.fechaYMD);
    const m = String(data.fechaISO || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + m[2] + m[3] : "";
  }

  function filename(data) {
    const ymd = fechaYMD(data);
    const y = ymd.slice(0, 4) || "0000", mo = ymd.slice(4, 6) || "00";
    const comp = pad(data.ptoVta, 5) + "-" + pad(data.nroCmp, 8);
    const imp = Math.round(Number(data.importe) || 0);
    return `NRD-${y}-${mo}-${comp}-${imp}.pdf`;
  }

  function build(data) {
    const esPrueba = /homolog/i.test(data.ambiente || "");
    const comp = pad(data.ptoVta, 5) + "-" + pad(data.nroCmp, 8);
    const fISO = data.fechaISO || (() => { const y = fechaYMD(data); return y ? `${y.slice(0,4)}-${y.slice(4,6)}-${y.slice(6,8)}` : ""; })();

    let filas;
    if (Array.isArray(data.items) && data.items.length) {
      filas = data.items.map(i => `<tr>
        <td>${esc(i.n)}${i.t ? ` — Talle ${esc(i.t)}` : ""}</td>
        <td class="num">${i.q}</td>
        <td class="num">${fmt(i.p)}</td>
        <td class="num">${fmt((Number(i.p) || 0) * (Number(i.q) || 0))}</td></tr>`).join("");
    } else {
      filas = `<tr><td>Venta de indumentaria${data.id ? ` — Pedido ${esc(data.id)}` : ""}</td>
        <td class="num">1</td><td class="num">${fmt(data.importe)}</td><td class="num">${fmt(data.importe)}</td></tr>`;
    }

    const html = `<div class="fac-hoja">
      ${esPrueba ? `<div class="fac-prueba">COMPROBANTE DE PRUEBA — SIN VALIDEZ FISCAL (homologación)</div>` : ""}
      <div class="fac-top">
        <div class="fac-emisor">
          <h1>${esc(FANTASIA)}</h1>
          <div class="fac-muted">${esc(RAZON)} · ${esc(COND)}</div>
          <div style="margin-top:8px">CUIT: <b>${cuitFmt(data.cuit)}</b></div>
          <div class="fac-muted">${esc(DOMICILIO)}</div>
          <div class="fac-muted">Punto de Venta: ${pad(data.ptoVta, 5)}</div>
        </div>
        <div class="fac-letra"><div class="fac-big">C</div><div class="fac-cod">COD. ${data.tipoCmp || 11}</div></div>
        <div class="fac-doc">
          <h2>FACTURA</h2>
          <div class="fac-r"><span class="fac-muted">Comprobante N°</span><b>${comp}</b></div>
          <div class="fac-r"><span class="fac-muted">Fecha de emisión</span><b>${iso2ar(fISO)}</b></div>
        </div>
      </div>
      <div class="fac-sec">
        <div class="fac-r2"><span>Cliente</span><b>${esc(data.cliente || "—")}</b></div>
        <div class="fac-r2"><span>Condición / Documento</span><span>${esc(receptor(data.receptorTipo, data.receptorNro))}</span></div>
        <div class="fac-r2"><span>Condición de venta</span><span>Contado</span></div>
      </div>
      <table class="fac-table">
        <thead><tr><th>Descripción</th><th class="num">Cant.</th><th class="num">P. unit.</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="fac-totrow"><div class="fac-totbox">
        <div class="fac-r3 big"><span>Total</span><span>${fmt(data.importe)}</span></div>
      </div></div>
      <div class="fac-foot">
        <div class="fac-qr" id="fac-qr"></div>
        <div class="fac-cae">
          <div class="fac-auth">Comprobante Autorizado</div>
          <div class="fac-r"><span class="fac-muted">CAE N°</span><b>${esc(data.cae)}</b></div>
          <div class="fac-r"><span class="fac-muted">Fecha Vto. CAE</span><b>${ymd2ar(data.caeVto)}</b></div>
          <div class="fac-muted" style="margin-top:8px;font-size:11px">Verificá este comprobante en afip.gob.ar</div>
        </div>
      </div>
    </div>`;
    return { html, filename: filename(data) };
  }

  function drawQR(container, qrUrl) {
    const el = container.querySelector("#fac-qr");
    if (!el || !global.qrcode || !qrUrl) return;
    const q = global.qrcode(0, "M"); q.addData(qrUrl); q.make();
    el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }

  // Variante raster (GIF data-URL) para html2canvas, que no rasteriza bien el SVG.
  function drawQRImage(container, qrUrl) {
    const el = container.querySelector("#fac-qr");
    if (!el || !global.qrcode || !qrUrl) return;
    const q = global.qrcode(0, "M"); q.addData(qrUrl); q.make();
    el.innerHTML = q.createImgTag(4, 0);
    const img = el.querySelector("img");
    if (img) { img.style.cssText = "width:100%;height:auto;display:block;image-rendering:pixelated"; }
  }

  global.NORD_FACTURA = { build, drawQR, drawQRImage, parseQr, filename };
})(window);
