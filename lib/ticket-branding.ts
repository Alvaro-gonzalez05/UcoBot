import { createElement } from "react"
import type { TicketBranding } from "@/lib/print-ticket"

/**
 * Arma la personalización del ticket a partir de la config del punto de venta.
 *
 * El QR se resuelve ACÁ y no dentro de print-ticket.ts por dos motivos: ese
 * archivo no monta React (es un generador de HTML puro), y el ticket se imprime
 * en una ventana aislada que puede no tener conexión — así que el código va
 * embebido como SVG en el propio documento, no como una imagen remota que
 * dependa de que cargue justo a tiempo.
 */

/** Forma de las columnas de ticket en `pos_settings`. */
export interface TicketSettingsRow {
  ticket_business_name?: string | null
  ticket_logo_url?: string | null
  ticket_footer_text?: string | null
  ticket_qr_url?: string | null
  ticket_qr_label?: string | null
}

/** Columnas de ticket, para sumar al select de pos_settings. */
export const TICKET_SETTINGS_COLUMNS =
  "ticket_business_name, ticket_logo_url, ticket_footer_text, ticket_qr_url, ticket_qr_label"

/** Cierre por defecto, el que ya salía impreso antes de que esto fuera editable. */
export const DEFAULT_TICKET_FOOTER = "¡Gracias por su compra!"

/**
 * SVG del código QR listo para embeber.
 *
 * Se importa en el momento y no arriba para no sumarle `react-dom/server` al
 * bundle de todas las pantallas que imprimen: solo se carga si el negocio
 * configuró un QR.
 */
export async function buildTicketQrSvg(url: string): Promise<string | null> {
  const link = (url || "").trim()
  if (!link) return null

  try {
    const [qrMod, serverMod] = await Promise.all([
      import("react-qr-code"),
      import("react-dom/server"),
    ])
    const QRCode = (qrMod as any).default
    const renderToStaticMarkup = (serverMod as any).renderToStaticMarkup

    if (!QRCode || !renderToStaticMarkup) return null

    return renderToStaticMarkup(
      createElement(QRCode, {
        value: link,
        size: 256,
        // Nivel medio: aguanta la baja definición de una térmica sin agrandar
        // demasiado la matriz, que a más módulos peor lee.
        level: "M",
        bgColor: "#FFFFFF",
        fgColor: "#000000",
      })
    )
  } catch {
    // Si falla, el ticket sale sin QR: no vale la pena frenar una venta por esto.
    return null
  }
}

/**
 * Identidad del local sin resolver el QR.
 *
 * Sirve para el ticket de cierre de caja, que lleva logo y encabezado pero no QR
 * ni texto de agradecimiento: es un documento interno, no un comprobante para el
 * cliente. Al no generar el código es síncrona, así no hay que esperar nada para
 * imprimir un arqueo.
 */
export function brandingIdentityFrom(
  settings?: TicketSettingsRow | null
): TicketBranding | undefined {
  if (!settings) return undefined
  if (!settings.ticket_logo_url && !settings.ticket_business_name) return undefined

  return {
    businessName: settings.ticket_business_name || null,
    logoUrl: settings.ticket_logo_url || null,
  }
}

/** Convierte la fila de `pos_settings` en el branding que espera printTicket. */
export async function resolveTicketBranding(
  settings?: TicketSettingsRow | null
): Promise<TicketBranding | undefined> {
  if (!settings) return undefined

  const qrUrl = (settings.ticket_qr_url || "").trim()
  const qrSvg = qrUrl ? await buildTicketQrSvg(qrUrl) : null

  return {
    businessName: settings.ticket_business_name || null,
    logoUrl: settings.ticket_logo_url || null,
    footerText: settings.ticket_footer_text || null,
    qrUrl: qrUrl || null,
    qrLabel: settings.ticket_qr_label || null,
    qrSvg,
  }
}
