// Impresión de tickets (58/80mm) vía iframe oculto.
// Se imprime SOLO cuando el documento del iframe terminó de cargar (onload):
// disparar antes de tiempo hacía que algunos webviews (POSNET Android)
// mandaran la página de atrás en vez del ticket. Sin pantallazos: la UI
// no se toca, el iframe es invisible.

export interface TicketItem {
  name: string
  quantity: number
  price: number
  /** Opciones elegidas (ej: Coca Zero) para mostrar bajo el item */
  options?: string[]
}

export interface TicketData {
  businessName: string
  orderId: string
  clientName?: string
  orderType?: string
  items: TicketItem[]
  total: number
  /** Propina/extra como línea agregada (se muestra antes del total) */
  tipAmount?: number
  /** Texto de la línea de propina (por defecto "Propina / extra") */
  tipLabel?: string
  payments?: { label?: string; method: string; amount: number }[]
  notes?: string
  /** Personalización del local (logo, encabezado, cierre, QR). */
  branding?: TicketBranding
}

/**
 * Personalización del ticket, configurada por el negocio en los ajustes del punto
 * de venta. Todo es opcional: sin nada, el ticket sale como salía siempre.
 */
export interface TicketBranding {
  /** Encabezado. Si falta se usa el nombre del negocio del pedido. */
  businessName?: string | null
  /** Logo del local (URL de imagen). Va arriba de todo. */
  logoUrl?: string | null
  /** Cierre. Si falta, "¡Gracias por su compra!". */
  footerText?: string | null
  /** Link del QR al pie. Vacío = sin QR. */
  qrUrl?: string | null
  /** Texto sobre el QR ("¡Calificanos!", "Seguinos"…). */
  qrLabel?: string | null
  /**
   * SVG del QR ya renderizado. Lo arma quien imprime (ver buildTicketQr): acá no
   * se puede, porque este archivo no monta React y el ticket tiene que poder
   * imprimirse sin conexión, así que el QR va embebido y no como imagen remota.
   */
  qrSvg?: string | null
}

export interface PrintTicketOptions {
  onComplete?: () => void
}

export type TicketWidth = 58 | 80

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * Limpia las notas para el ticket: saca todo lo interno que arrastra el punto
 * de venta (origen "Venta generada...", método de pago, "Pagó con... Vuelto...",
 * y la propina — que ya se muestra como su propia línea). Solo quedan las notas
 * reales del cliente.
 */
export function cleanTicketNotes(notes?: string | null): string {
  if (!notes) return ""
  return notes
    .split(/\.\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^m[eé]todo de pago/i.test(s))
    .filter((s) => !/^pag[oó]\s+con/i.test(s))
    .filter((s) => !/^venta generada/i.test(s))
    .filter((s) => !/^propina/i.test(s))
    .join(". ")
}

const money = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(v)

/** Contenido interno del ticket (mismo look que la vista previa). */
export function buildTicketInner(t: TicketData): string {
  const fechaStr = new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" })

  const itemRows = t.items
    .map(
      (it) => `
      <div class="item">
        <span class="iname">${it.quantity}x ${esc(it.name)}${
          it.options && it.options.length ? `<span class="iopts">${esc(it.options.join(", "))}</span>` : ""
        }</span>
        <span class="iprice">${money(it.price * it.quantity)}</span>
      </div>`
    )
    .join("")

  // Un solo pago que cubre todo el total es redundante (repite el TOTAL): no se muestra.
  // Solo tiene sentido detallar los pagos cuando fue dividido (2+ métodos).
  const showPayments =
    t.payments && t.payments.length > 0 &&
    !(t.payments.length === 1 && Math.abs(t.payments[0].amount - t.total) < 0.01)
  const paymentRows =
    showPayments
      ? `<div class="sep"></div>
         ${t.payments!
           .map((p) => `<div class="row"><span>${esc(p.label || p.method)}</span><span>${money(p.amount)}</span></div>`)
           .join("")}`
      : ""

  const cleanedNotes = cleanTicketNotes(t.notes)

  const b = t.branding || {}

  // El logo se imprime en escala de grises: las térmicas son monocromas y una
  // imagen a color sale como una mancha.
  const logoBlock = b.logoUrl
    ? `<div class="center"><img class="logo" src="${esc(b.logoUrl)}" alt="" /></div>`
    : ""

  return `
    ${logoBlock}
    <div class="center biz">${esc(b.businessName || t.businessName)}</div>
    <div class="center muted">${fechaStr}</div>
    <div class="sep"></div>
    <div class="row"><span>Pedido</span><span>#${esc(t.orderId.slice(0, 8).toUpperCase())}</span></div>
    ${t.clientName ? `<div class="row"><span>Cliente</span><span>${esc(t.clientName)}</span></div>` : ""}
    ${t.orderType ? `<div class="row"><span>Modalidad</span><span>${esc(t.orderType)}</span></div>` : ""}
    <div class="sep"></div>
    ${itemRows}
    ${t.tipAmount && t.tipAmount > 0 ? `
    <div class="sep"></div>
    <div class="row"><span>Subtotal</span><span>${money(t.total - t.tipAmount)}</span></div>
    <div class="row"><span>${esc(t.tipLabel || "Propina / extra")}</span><span>+${money(t.tipAmount)}</span></div>` : ""}
    <div class="sep"></div>
    <div class="row total"><span>TOTAL</span><span>${money(t.total)}</span></div>
    ${paymentRows}
    ${cleanedNotes ? `<div class="notes">Nota: ${esc(cleanedNotes)}</div>` : ""}
    <div class="center muted footer">${esc(b.footerText || "¡Gracias por su compra!")}</div>
    ${
      b.qrSvg
        ? `<div class="center qrbox">
             ${b.qrLabel ? `<div class="muted bold qrlabel">${esc(b.qrLabel)}</div>` : ""}
             <div class="qr">${b.qrSvg}</div>
           </div>`
        : ""
    }
    <div class="center muted">No válido como factura</div>
    <div class="center muted bold" style="margin-top:4px;">UCOBOT - CODEA DESARROLLOS</div>`
}

/** Datos del ticket de cierre de caja (arqueo del turno). */
export interface CashCloseTicketData {
  businessName: string
  sessionId: string
  openedBy: string
  closedBy?: string
  openedAt: string | Date
  closedAt?: string | Date
  openingAmount: number
  /** Totales vendidos por método de pago (ya con label legible) */
  totalsByMethod: { label: string; amount: number }[]
  tipsTotal?: number
  salesCount: number
  cancelledCount?: number
  /** Detalle de los cancelados, para que el arqueo diga CUÁLES y por cuánto. */
  cancelledDetail?: { id: string; total: number; created_at: string }[]
  /** Pedidos borrados a mano durante el turno. */
  deletedCount?: number
  deletedTotal?: number
  deletedDetail?: { id: string; total: number; created_at: string }[]
  /** Efectivo esperado en caja (apertura + ventas en efectivo) */
  expectedCash: number
  /** Efectivo contado en el arqueo */
  countedCash?: number
  /** contado - esperado */
  difference?: number
  notes?: string
  /**
   * Identidad del local: logo y encabezado. El QR y el texto de cierre NO se usan
   * acá — este es un documento interno de control, no algo que se le entrega al
   * cliente, así que no lleva ni "gracias por su compra" ni códigos para escanear.
   */
  branding?: TicketBranding
}

/** Contenido interno del ticket de cierre de caja (mismos estilos que el de venta). */
export function buildCashCloseTicketInner(d: CashCloseTicketData): string {
  // Formato corto 24h ("20/07/26 15:18") para que la fecha entre en una sola línea
  const fmtDate = (v: string | Date) => {
    const date = new Date(v)
    const day = date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })
    const time = date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })
    return `${day} ${time}`
  }
  const nowrap = (s: string) => `<span style="white-space:nowrap">${s}</span>`
  const fmtHour = (v: string) =>
    new Date(v).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })

  const methodRows = d.totalsByMethod
    .map((m) => `<div class="row"><span>${esc(m.label)}</span><span>${money(m.amount)}</span></div>`)
    .join("")

  const salesTotal = d.totalsByMethod.reduce((acc, m) => acc + m.amount, 0)

  const b = d.branding || {}
  const logoBlock = b.logoUrl
    ? `<div class="center"><img class="logo" src="${esc(b.logoUrl)}" alt="" /></div>`
    : ""

  return `
    ${logoBlock}
    <div class="center biz">${esc(b.businessName || d.businessName)}</div>
    <div class="center bold" style="margin-top:2px;">CIERRE DE CAJA</div>
    <div class="center muted">Caja #${esc(d.sessionId.slice(0, 8).toUpperCase())}</div>
    <div class="sep"></div>
    <div class="row"><span>Responsable</span><span>${esc(d.closedBy || d.openedBy)}</span></div>
    <div class="row"><span>Apertura</span>${nowrap(fmtDate(d.openedAt))}</div>
    <div class="row"><span>Cierre</span>${nowrap(fmtDate(d.closedAt ?? new Date()))}</div>
    ${d.closedBy && d.closedBy !== d.openedBy ? `<div class="row"><span>Abrió</span><span>${esc(d.openedBy)}</span></div>` : ""}
    <div class="row"><span>Monto inicial</span><span>${money(d.openingAmount)}</span></div>
    <div class="sep"></div>
    <div class="center bold" style="margin:2px 0 4px;">MOVIMIENTOS DE CAJA</div>
    <div class="row"><span>Ventas</span><span>${d.salesCount}</span></div>
    ${methodRows}
    ${d.cancelledCount ? `<div class="row"><span>Cancelados</span><span>${d.cancelledCount}</span></div>` : ""}
    ${
      d.cancelledDetail && d.cancelledDetail.length > 0
        ? d.cancelledDetail
            .map(
              (c) =>
                `<div class="row sub"><span>· #${esc(c.id.slice(0, 6).toUpperCase())} ${fmtHour(c.created_at)}</span><span>${money(c.total)}</span></div>`
            )
            .join("")
        : ""
    }
    ${
      d.deletedCount
        ? `<div class="row"><span>Eliminados</span><span>${d.deletedCount}</span></div>` +
          (d.deletedDetail || [])
            .map(
              (c) =>
                `<div class="row sub"><span>· #${esc(c.id.slice(0, 6).toUpperCase())} ${fmtHour(c.created_at)}</span><span>${money(c.total)}</span></div>`
            )
            .join("") +
          (d.deletedTotal
            ? `<div class="row"><span>Total eliminado</span><span>${money(d.deletedTotal)}</span></div>`
            : "")
        : ""
    }
    <div class="sep"></div>
    <div class="row total"><span>Total generado</span><span>${money(salesTotal)}</span></div>
    <div class="row"><span>Efectivo esperado</span><span>${money(d.expectedCash)}</span></div>
    ${typeof d.countedCash === "number" ? `<div class="row"><span>Efectivo contado</span><span>${money(d.countedCash)}</span></div>` : ""}
    ${typeof d.difference === "number" ? `<div class="row"><span>Diferencia</span><span>${d.difference >= 0 ? "+" : ""}${money(d.difference)}</span></div>` : ""}
    ${d.tipsTotal && d.tipsTotal > 0 ? `
    <div class="sep"></div>
    <div class="row total"><span>PROPINAS A RETIRAR</span><span>${money(d.tipsTotal)}</span></div>
    <div class="center muted" style="margin-top:2px;">Se retiran aparte del efectivo de caja</div>` : ""}
    ${d.notes ? `<div class="notes">Nota: ${esc(d.notes)}</div>` : ""}
    <div class="center muted footer">Documento interno de control</div>
    <div class="center muted bold" style="margin-top:4px;">UCOBOT - CODEA DESARROLLOS</div>`
}

/** Envoltura HTML común de todos los tickets térmicos (venta, cierre de caja). */
function buildDocumentShell(inner: string, widthMm: TicketWidth, autoPrint = false): string {
  const bodyW = widthMm === 58 ? 54 : 72
  const baseFont = widthMm === 58 ? 15 : 17
  const bigFont = widthMm === 58 ? 19 : 23
  const smallFont = widthMm === 58 ? 12 : 13

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title> </title>
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    width: ${bodyW}mm;
    margin: 0 auto;
    padding: 3mm 2mm;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: ${baseFont}px;
    font-weight: 600;
    color: #000;
    line-height: 1.4;
  }
  .center { text-align: center; }
  .biz { font-size: ${bigFont}px; font-weight: 700; text-transform: uppercase; }
  .muted { font-size: ${smallFont}px; font-weight: 500; }
  .bold { font-weight: 700; }
  .sep { border-top: 1px dashed #000; margin: 8px 0; }
  .row, .item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin: 4px 0;
    padding: 4px 0 6px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }
  .item {
    line-height: 1.28;
  }
  .row:last-of-type, .item:last-of-type {
    border-bottom: 0;
    padding-bottom: 0;
  }
  .iname {
    flex: 1 1 auto;
    min-width: 0;
    word-break: break-word;
    white-space: normal;
    margin-right: 8px;
    font-size: 13px;
    line-height: 1.32;
  }
  .iopts {
    display: block;
    font-size: 11px;
    font-weight: 500;
    padding-left: 10px;
  }
  .iprice {
    white-space: nowrap;
    flex-shrink: 0;
    text-align: right;
    font-weight: 700;
    font-size: 13px;
  }
  .total { font-size: ${bigFont}px; font-weight: 700; }
  .notes { font-size: ${smallFont}px; margin-top: 4px; word-break: break-word; }
  /* Sublíneas del detalle de cancelados/eliminados: más chicas y sin separador,
     para que se lean como hijas de la línea de arriba. */
  .row.sub {
    font-size: ${smallFont}px;
    font-weight: 500;
    margin: 0;
    padding: 1px 0 1px 6px;
    border-bottom: 0;
  }
  .footer { margin-top: 10px; }
  .logo {
    max-width: 70%;
    max-height: 22mm;
    margin: 0 auto 6px;
    display: block;
    /* Monocromo y con contraste alto: es lo que mejor sale en papel térmico. */
    filter: grayscale(100%) contrast(1.35);
  }
  .qrbox { margin-top: 10px; }
  .qrlabel { margin-bottom: 4px; }
  .qr svg { width: 28mm; height: 28mm; }
  .actions { display: none; }
  ${autoPrint ? `
  .actions {
    display: flex;
    gap: 8px;
    margin: 14px 0 6px;
  }
  .actions button {
    flex: 1;
    padding: 12px 10px;
    border: 0;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 800;
    font-family: inherit;
  }
  .btn-close { background: #d1f366; color: #1c1c28; }
  .btn-print { background: #e5e5e5; color: #333; }
  @media print {
    .actions { display: none !important; }
  }` : ""}
</style>
</head>
<body>${inner}${autoPrint ? `
<div class="actions">
  <button type="button" class="btn-close" onclick="window.close()">✓ Listo, volver</button>
  <button type="button" class="btn-print" onclick="window.print()">Reimprimir</button>
</div>
<script>
  // CIERRE AUTOMÁTICO: SOLO fuera de Android.
  //
  // En Android NO se cierra nunca. Ahí afterprint dispara apenas se abre el
  // diálogo (no al terminar el trabajo), así que cerrar la ventana mata al plugin
  // de impresión del POSNET con "se produjo un error al imprimir la página". Ya se
  // probó dos veces; para volver a la app está el botón "✓ Listo, volver".
  //
  // En escritorio el problema no existe: el trabajo ya quedó en la cola de
  // Windows cuando afterprint dispara. Y con Chrome en modo --kiosk-printing, que
  // es como corren las cajas, ni siquiera hay diálogo: la ventana quedaba abierta
  // sin motivo después de cada ticket.
  var esAndroid = /android/i.test(navigator.userAgent || "")

  if (!esAndroid) {
    window.addEventListener("afterprint", function () {
      setTimeout(function () {
        try { window.close() } catch (error) {}
      }, 600)
    })
  }

  window.addEventListener("load", function () {
    setTimeout(function () {
      try {
        window.focus()
        var printBtn = document.querySelector(".btn-print")
        if (printBtn) printBtn.focus()
        window.print()
      } catch (error) {
        // El webview del POS puede no abrir el diálogo automáticamente; el botón.
      }
    }, 250)
  })
</script>` : ""}</body>
</html>`
}

export function printTicket(t: TicketData, widthMm: TicketWidth = 80, options?: PrintTicketOptions) {
  printThermalDocument(buildTicketInner(t), widthMm, options)
}

/** Imprime el ticket de cierre de caja con la misma mecánica que el de venta. */
export function printCashCloseTicket(d: CashCloseTicketData, widthMm: TicketWidth = 80, options?: PrintTicketOptions) {
  printThermalDocument(buildCashCloseTicketInner(d), widthMm, options)
}

function printThermalDocument(inner: string, widthMm: TicketWidth, options?: PrintTicketOptions) {
  if (typeof window === "undefined" || typeof document === "undefined") return

  const html = buildDocumentShell(inner, widthMm, true)
  let popupUrl: string | null = null

  try {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    popupUrl = URL.createObjectURL(blob)
  } catch (error) {
    popupUrl = null
  }

  const popup = popupUrl
    ? window.open(popupUrl, "_blank", "noopener,noreferrer,width=380,height=720")
    : window.open("", "_blank", "noopener,noreferrer,width=380,height=720")

  if (popup) {
    try {
      if (!popupUrl) {
        popup.document.open()
        popup.document.write(html)
        popup.document.close()
      }
      // IMPORTANTE: NO llamamos popup.print() acá. El documento del ticket ya
      // se imprime y se cierra solo (script inline). Llamarlo también desde el
      // padre generaba un DOBLE disparo de impresión que, junto con el cierre
      // por afterprint, hacía fallar al plugin ("error al imprimir la página").
      setTimeout(() => {
        try { if (popupUrl) URL.revokeObjectURL(popupUrl) } catch (error) {}
      }, 10000)
    } catch (error) {
      try { popup.close() } catch (closeError) {}
    }

    options?.onComplete?.()
    return
  }

  // Fallback: si el popup fue bloqueado, usamos un iframe oculto.
  const iframe = document.createElement("iframe")
  iframe.id = "__ticket_print_frame"
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  document.body.appendChild(iframe)

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    iframe.remove()
  }

  const doc = iframe.contentWindow?.document
  if (!doc) {
    cleanup()
    options?.onComplete?.()
    return
  }

  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch (error) {}
      finally {
        setTimeout(cleanup, 8000)
        options?.onComplete?.()
      }
    }, 200)
  }

  doc.open()
  doc.write(buildDocumentShell(inner, widthMm))
  doc.close()
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch (error) {}
    finally {
      setTimeout(cleanup, 8000)
      options?.onComplete?.()
    }
  }, 2500)
}
