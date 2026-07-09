// Impresión de tickets (58/80mm) vía iframe oculto.
// Se imprime SOLO cuando el documento del iframe terminó de cargar (onload):
// disparar antes de tiempo hacía que algunos webviews (POSNET Android)
// mandaran la página de atrás en vez del ticket. Sin pantallazos: la UI
// no se toca, el iframe es invisible.

export interface TicketItem {
  name: string
  quantity: number
  price: number
}

export interface TicketData {
  businessName: string
  orderId: string
  clientName?: string
  orderType?: string
  items: TicketItem[]
  total: number
  payments?: { label?: string; method: string; amount: number }[]
  notes?: string
}

export type TicketWidth = 58 | 80

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * Limpia las notas para el ticket: saca el "Método de pago: ..." y el
 * "Pagó con ... · Vuelto ..." que arrastra el punto de venta, porque hasta
 * que la venta no está cobrada no corresponde mostrar un medio de pago.
 */
export function cleanTicketNotes(notes?: string | null): string {
  if (!notes) return ""
  return notes
    .split(/\.\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^m[eé]todo de pago/i.test(s))
    .filter((s) => !/^pag[oó]\s+con/i.test(s))
    .join(". ")
}

const money = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(v)

/** Contenido interno del ticket (mismo look que la vista previa). */
function buildTicketInner(t: TicketData): string {
  const fechaStr = new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" })

  const itemRows = t.items
    .map(
      (it) => `
      <div class="item">
        <span class="iname">${it.quantity}x ${esc(it.name)}</span>
        <span class="iprice">${money(it.price * it.quantity)}</span>
      </div>`
    )
    .join("")

  const paymentRows =
    t.payments && t.payments.length > 0
      ? `<div class="sep"></div>
         ${t.payments
           .map((p) => `<div class="row"><span>${esc(p.label || p.method)}</span><span>${money(p.amount)}</span></div>`)
           .join("")}`
      : ""

  const cleanedNotes = cleanTicketNotes(t.notes)

  return `
    <div class="center biz">${esc(t.businessName)}</div>
    <div class="center muted">${fechaStr}</div>
    <div class="sep"></div>
    <div class="row"><span>Pedido</span><span>#${esc(t.orderId.slice(0, 8).toUpperCase())}</span></div>
    ${t.clientName ? `<div class="row"><span>Cliente</span><span>${esc(t.clientName)}</span></div>` : ""}
    ${t.orderType ? `<div class="row"><span>Modalidad</span><span>${esc(t.orderType)}</span></div>` : ""}
    <div class="sep"></div>
    ${itemRows}
    <div class="sep"></div>
    <div class="row total"><span>TOTAL</span><span>${money(t.total)}</span></div>
    ${paymentRows}
    ${cleanedNotes ? `<div class="notes">Nota: ${esc(cleanedNotes)}</div>` : ""}
    <div class="center muted footer">¡Gracias por su compra!</div>
    <div class="center muted">No válido como factura</div>
    <div class="center muted bold" style="margin-top:4px;">UCOBOT - CODEA DESARROLLOS</div>`
}

/** Documento standalone del ticket (iframe o pestaña de impresión). */
function buildTicketDocument(t: TicketData, widthMm: TicketWidth, autoPrint = false): string {
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
  .row, .item { display: flex; justify-content: space-between; gap: 8px; }
  .iname { min-width: 0; word-break: break-word; }
  .iprice { white-space: nowrap; flex-shrink: 0; }
  .total { font-size: ${bigFont}px; font-weight: 700; }
  .notes { font-size: ${smallFont}px; margin-top: 4px; word-break: break-word; }
  .footer { margin-top: 10px; }
  .actions { display: none; }
  ${autoPrint ? `
  /* Botonera visible solo en pantalla (nunca sale en el papel) */
  .actions {
    display: flex;
    gap: 8px;
    margin: 14px 0 6px;
  }
  .actions button {
    flex: 1;
    padding: 14px 10px;
    border: 0;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 800;
    font-family: inherit;
  }
  .btn-print { background: #d1f366; color: #1c1c28; }
  .btn-close { background: #e5e5e5; color: #333; }
  @media print {
    .actions { display: none !important; }
  }` : ""}
</style>
</head>
<body>${buildTicketInner(t)}${autoPrint ? `
<div class="actions">
  <button type="button" class="btn-print" onclick="window.print()">IMPRIMIR</button>
  <button type="button" class="btn-close" onclick="window.close()">Cerrar</button>
</div>
<script>
  // Pestaña de impresión para Android/POSNET (imprimir desde iframe no anda ahí).
  // OJO: no usamos onafterprint para autocerrar porque en Android dispara
  // apenas se ABRE el diálogo (cerraba la pestaña antes de poder imprimir).
  // La pestaña queda abierta con los botones IMPRIMIR / Cerrar.
  window.onload = function () {
    setTimeout(function () {
      try { window.focus(); window.print(); } catch (e) { /* el botón queda de respaldo */ }
    }, 400);
  };
</script>` : ""}</body>
</html>`
}

const IFRAME_ID = "__ticket_print_frame"

export function printTicket(t: TicketData, widthMm: TicketWidth = 80) {
  // Android (incluye POSNET): Chrome/webviews no soportan imprimir desde un
  // iframe (falla silenciosamente). Abrimos el ticket en una pestaña propia
  // que se imprime sola y se cierra al terminar.
  if (/android/i.test(navigator.userAgent)) {
    const w = window.open("", "_blank")
    if (w) {
      w.document.open()
      w.document.write(buildTicketDocument(t, widthMm, true))
      w.document.close()
      return
    }
    // Si el popup fue bloqueado, seguimos con el iframe como último recurso.
  }

  // Evitar doble impresión si ya hay una en curso
  if (document.getElementById(IFRAME_ID)) return

  // Iframe con el ticket standalone: es lo único que se manda a imprimir.
  const iframe = document.createElement("iframe")
  iframe.id = IFRAME_ID
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
    return
  }

  let printed = false
  const doPrint = () => {
    if (printed) return
    printed = true
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      // El diálogo ya capturó el contenido; damos margen de sobra en webviews lentos
      setTimeout(cleanup, 8000)
    }
  }

  // Imprimir recién cuando el documento del iframe terminó de cargar.
  // (La intermitencia venía de imprimir antes de tiempo: el webview del POSNET
  // todavía no tenía el ticket listo y mandaba la página de atrás.)
  iframe.onload = () => setTimeout(doPrint, 200)
  doc.open()
  doc.write(buildTicketDocument(t, widthMm))
  doc.close()
  // Fallback tardío por si onload nunca dispara en este webview
  setTimeout(doPrint, 2500)
}
