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

  return `
    <div class="center biz">${esc(t.businessName)}</div>
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
    <div class="center muted footer">¡Gracias por su compra!</div>
    <div class="center muted">No válido como factura</div>
    <div class="center muted bold" style="margin-top:4px;">UCOBOT - CODEA DESARROLLOS</div>`
}

/** Documento standalone del ticket para una ventana de impresión. */
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
  .footer { margin-top: 10px; }
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
  // Al terminar (o cancelar) la impresión, cerramos esta pestaña y volvemos
  // solos a la sección de donde vino. Si el webview no dispara afterprint,
  // queda el botón "Cerrar" como respaldo.
  var __closed = false;
  function __closeTicket() {
    if (__closed) return;
    __closed = true;
    // Damos aire a que el trabajo de impresión se mande antes de cerrar.
    setTimeout(function () { try { window.close() } catch (e) {} }, 500)
  }
  window.addEventListener("afterprint", __closeTicket)
  window.addEventListener("load", function () {
    setTimeout(function () {
      try {
        window.focus()
        const printBtn = document.querySelector(".btn-print")
        printBtn?.focus()
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
  if (typeof window === "undefined" || typeof document === "undefined") return

  const html = buildTicketDocument(t, widthMm, true)
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
  doc.write(buildTicketDocument(t, widthMm))
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
