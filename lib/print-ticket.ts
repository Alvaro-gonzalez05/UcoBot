// Impresión de tickets (58/80mm).
// Método robusto para cualquier dispositivo (incluido el webview del POSNET
// Android): imprimimos la propia página con window.print() pero ocultando TODO
// menos el ticket vía @media print. Así nunca sale la pantalla/preview, solo el
// ticket, y respeta el tamaño del papel con @page.

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

const CONTAINER_ID = "__ticket_print"
const STYLE_ID = "__ticket_print_style"

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

/** CSS: en pantalla el ticket está oculto; al imprimir, se oculta TODO menos el ticket. */
function buildScopedStyle(widthMm: TicketWidth): string {
  const bodyW = widthMm === 58 ? 54 : 72
  const baseFont = widthMm === 58 ? 15 : 17
  const bigFont = widthMm === 58 ? 19 : 23
  const smallFont = widthMm === 58 ? 12 : 13

  return `
    #${CONTAINER_ID} { display: none; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body > *:not(#${CONTAINER_ID}) { display: none !important; }
      #${CONTAINER_ID} {
        display: block !important;
        width: ${bodyW}mm;
        margin: 0 auto;
        padding: 3mm 2mm;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: ${baseFont}px;
        font-weight: 600;
        color: #000;
        line-height: 1.4;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      #${CONTAINER_ID} * { box-sizing: border-box; margin: 0; padding: 0; }
      #${CONTAINER_ID} .center { text-align: center; }
      #${CONTAINER_ID} .biz { font-size: ${bigFont}px; font-weight: 700; text-transform: uppercase; }
      #${CONTAINER_ID} .muted { font-size: ${smallFont}px; font-weight: 500; }
      #${CONTAINER_ID} .bold { font-weight: 700; }
      #${CONTAINER_ID} .sep { border-top: 1px dashed #000; margin: 8px 0; }
      #${CONTAINER_ID} .row, #${CONTAINER_ID} .item { display: flex; justify-content: space-between; gap: 8px; }
      #${CONTAINER_ID} .iname { min-width: 0; word-break: break-word; }
      #${CONTAINER_ID} .iprice { white-space: nowrap; flex-shrink: 0; }
      #${CONTAINER_ID} .total { font-size: ${bigFont}px; font-weight: 700; }
      #${CONTAINER_ID} .notes { font-size: ${smallFont}px; margin-top: 4px; word-break: break-word; }
      #${CONTAINER_ID} .footer { margin-top: 10px; }
      @page { size: ${widthMm}mm auto; margin: 0; }
    }`
}

export function printTicket(t: TicketData, widthMm: TicketWidth = 80) {
  // Limpiar restos de una impresión anterior
  document.getElementById(CONTAINER_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()

  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = buildScopedStyle(widthMm)
  document.head.appendChild(style)

  const container = document.createElement("div")
  container.id = CONTAINER_ID
  container.innerHTML = buildTicketInner(t)
  document.body.appendChild(container)

  const cleanup = () => {
    container.remove()
    style.remove()
    window.removeEventListener("afterprint", cleanup)
  }
  window.addEventListener("afterprint", cleanup)

  // Un tick para que el DOM/estilos se apliquen antes de abrir el diálogo
  setTimeout(() => {
    window.print()
    // Fallback: algunos webviews no disparan afterprint
    setTimeout(cleanup, 4000)
  }, 80)
}
