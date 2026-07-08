// Impresión de tickets (80mm) vía iframe oculto + window.print().
// Funciona con cualquier impresora instalada en el sistema (incluidos
// tiketeros térmicos): el usuario elige la impresora en el diálogo del SO
// y el navegador la recuerda para las próximas impresiones.

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

export type TicketWidth = 58 | 80

export function buildTicketHtml(t: TicketData, widthMm: TicketWidth = 80): string {
  // Siempre la fecha/hora exacta del momento de impresión (no la del pedido)
  const fechaStr = new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" })

  // Medidas según el ancho de papel del negocio (el área imprimible es ~6-8mm menor).
  // Fuentes grandes + negrita: las térmicas marcan mejor con texto grueso.
  const bodyW = widthMm === 58 ? 54 : 72
  const baseFont = widthMm === 58 ? 15 : 17
  const bigFont = widthMm === 58 ? 19 : 23
  const smallFont = widthMm === 58 ? 12 : 13

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
  .sep { border-top: 1px dashed #000; margin: 8px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .item { display: flex; justify-content: space-between; gap: 8px; }
  .iname { min-width: 0; word-break: break-word; }
  .iprice { white-space: nowrap; flex-shrink: 0; }
  .total { font-size: ${bigFont}px; font-weight: 700; }
  .notes { font-size: ${smallFont}px; margin-top: 4px; word-break: break-word; }
  .footer { margin-top: 10px; }
</style>
</head>
<body>
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
  ${cleanTicketNotes(t.notes) ? `<div class="notes">Nota: ${esc(cleanTicketNotes(t.notes))}</div>` : ""}
  <div class="center muted footer">¡Gracias por su compra!</div>
  <div class="center muted">No válido como factura</div>
  <div class="center muted" style="margin-top:4px;font-weight:700;">UCOBOT - CODEA DESARROLLOS</div>
</body>
</html>`
}

export function printTicket(t: TicketData, widthMm: TicketWidth = 80) {
  const html = buildTicketHtml(t, widthMm)
  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    iframe.remove()
    return
  }
  let printed = false
  const doPrint = () => {
    if (printed) return
    printed = true
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      /* noop */
    } finally {
      // Se limpia después: el diálogo de impresión ya capturó el contenido
      setTimeout(() => iframe.remove(), 4000)
    }
  }

  // Imprimimos recién cuando el contenido del iframe está listo (más confiable
  // en webviews lentos como el POSNET Android). Fallback por si onload no dispara.
  iframe.onload = () => setTimeout(doPrint, 200)
  doc.open()
  doc.write(html)
  doc.close()
  setTimeout(doPrint, 600)
}
