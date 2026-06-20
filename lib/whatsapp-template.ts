/**
 * Utilidades para enviar plantillas de WhatsApp con variables en cualquier parte:
 * encabezado (texto o media), cuerpo y botones de URL dinámica.
 *
 * Meta arma el mensaje final: nosotros mandamos el NOMBRE de la plantilla + los
 * valores por componente. Esta util convierte los valores que carga el agente en
 * la estructura `components` que espera la Graph API.
 */

export interface TemplateComponent {
  type: string // HEADER | BODY | FOOTER | BUTTONS
  format?: string // TEXT | IMAGE | VIDEO | DOCUMENT (para HEADER)
  text?: string
  buttons?: { type: string; text: string; url?: string }[]
}

export interface TemplateSlot {
  key: string // identificador único del valor (ej: "body_1", "header_text", "button_0")
  group: "header" | "body" | "button"
  kind: "text" | "media"
  label: string
  placeholder?: string
  mediaType?: "image" | "video" | "document"
}

const HEADER_MEDIA = ["IMAGE", "VIDEO", "DOCUMENT"]

export function getBodyText(components: TemplateComponent[] = []): string {
  return components.find((c) => c.type === "BODY")?.text || ""
}

function countVars(text: string): number {
  return new Set((text || "").match(/\{\{\d+\}\}/g) || []).size
}

/** Lista ordenada de campos que el agente debe completar para esta plantilla. */
export function getTemplateSlots(components: TemplateComponent[] = []): TemplateSlot[] {
  const slots: TemplateSlot[] = []

  const header = components.find((c) => c.type === "HEADER")
  if (header) {
    if (header.format === "TEXT" && countVars(header.text || "") > 0) {
      slots.push({ key: "header_text", group: "header", kind: "text", label: "Encabezado" })
    } else if (header.format && HEADER_MEDIA.includes(header.format)) {
      slots.push({
        key: "header_media",
        group: "header",
        kind: "media",
        mediaType: header.format.toLowerCase() as "image" | "video" | "document",
        label: `Archivo del encabezado (${header.format.toLowerCase()})`,
        placeholder: "https://… (URL pública del archivo)",
      })
    }
  }

  const bodyCount = countVars(getBodyText(components))
  for (let i = 1; i <= bodyCount; i++) {
    slots.push({ key: `body_${i}`, group: "body", kind: "text", label: `Mensaje · variable {{${i}}}` })
  }

  const buttons = components.find((c) => c.type === "BUTTONS")?.buttons || []
  buttons.forEach((b, idx) => {
    if (b.type === "URL" && countVars(b.url || "") > 0) {
      slots.push({
        key: `button_${idx}`,
        group: "button",
        kind: "text",
        label: `Botón "${b.text}" · parte variable del enlace`,
        placeholder: "ej: 12345 o mi-pagina",
      })
    }
  })

  return slots
}

/** Construye el array `components` para la Graph API a partir de los valores cargados. */
export function buildTemplateComponents(
  components: TemplateComponent[] = [],
  values: Record<string, string>
): any[] {
  const out: any[] = []

  const header = components.find((c) => c.type === "HEADER")
  if (header) {
    if (header.format === "TEXT" && countVars(header.text || "") > 0 && values.header_text) {
      out.push({ type: "header", parameters: [{ type: "text", text: values.header_text }] })
    } else if (header.format && HEADER_MEDIA.includes(header.format) && values.header_media) {
      const mt = header.format.toLowerCase() // image | video | document
      out.push({ type: "header", parameters: [{ type: mt, [mt]: { link: values.header_media } }] })
    }
  }

  const bodyCount = countVars(getBodyText(components))
  if (bodyCount > 0) {
    out.push({
      type: "body",
      parameters: Array.from({ length: bodyCount }, (_, i) => ({
        type: "text",
        text: values[`body_${i + 1}`] || "",
      })),
    })
  }

  const buttons = components.find((c) => c.type === "BUTTONS")?.buttons || []
  buttons.forEach((b, idx) => {
    if (b.type === "URL" && countVars(b.url || "") > 0 && values[`button_${idx}`]) {
      out.push({
        type: "button",
        sub_type: "url",
        index: String(idx),
        parameters: [{ type: "text", text: values[`button_${idx}`] }],
      })
    }
  })

  return out
}

/** Texto del cuerpo con las variables reemplazadas (solo para mostrar en el chat). */
export function renderBodyPreview(components: TemplateComponent[] = [], values: Record<string, string>): string {
  return getBodyText(components).replace(/\{\{(\d+)\}\}/g, (_, n) => values[`body_${n}`] || `{{${n}}}`)
}
