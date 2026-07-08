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

const money = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(v)

export function buildTicketHtml(t: TicketData): string {
  // Siempre la fecha/hora exacta del momento de impresión (no la del pedido)
  const fechaStr = new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" })

  const itemRows = t.items
    .map(
      (it) => `
      <tr>
        <td class="qty">${it.quantity}x</td>
        <td class="name">${esc(it.name)}</td>
        <td class="price">${money(it.price * it.quantity)}</td>
      </tr>`
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
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 72mm;
    margin: 0 auto;
    padding: 4mm 2mm;
    font-family: "Courier New", ui-monospace, monospace;
    font-size: 12px;
    color: #000;
    line-height: 1.35;
  }
  .center { text-align: center; }
  .biz { font-size: 15px; font-weight: 700; text-transform: uppercase; }
  .muted { font-size: 10px; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  .qty { width: 24px; white-space: nowrap; }
  .name { padding-right: 4px; word-break: break-word; }
  .price { text-align: right; white-space: nowrap; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .total { font-size: 15px; font-weight: 700; }
  .notes { font-size: 10px; margin-top: 4px; word-break: break-word; }
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
  <table>${itemRows}</table>
  <div class="sep"></div>
  <div class="row total"><span>TOTAL</span><span>${money(t.total)}</span></div>
  ${paymentRows}
  ${t.notes ? `<div class="notes">Nota: ${esc(t.notes)}</div>` : ""}
  <div class="center muted footer">¡Gracias por su compra!</div>
  <div class="center muted" style="margin-top:4px;font-weight:700;">UCOBOT - CODEA DESARROLLOS</div>
</body>
</html>`
}

export function printTicket(t: TicketData) {
  const html = buildTicketHtml(t)
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
  doc.open()
  doc.write(html)
  doc.close()

  // Pequeña espera para que el iframe renderice antes de abrir el diálogo de impresión
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      // Se limpia después: el diálogo de impresión ya capturó el contenido
      setTimeout(() => iframe.remove(), 3000)
    }
  }, 150)
}
