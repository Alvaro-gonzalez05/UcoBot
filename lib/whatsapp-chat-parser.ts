/**
 * Parser de chats exportados de WhatsApp (.txt, "sin archivos").
 *
 * Soporta los dos formatos de exportación:
 *  - Android:  `12/5/24, 14:30 - Juan Pérez: hola`
 *  - iOS:      `[12/05/24 14:30:45] Juan Pérez: hola`
 * con o sin segundos, con AM/PM ("a. m." / "p. m.") y mensajes multilínea.
 * Asume fechas en formato día/mes (formato latino).
 */

export interface ParsedMessage {
  sender: string
  text: string
  timestamp: string // ISO
}

export interface ParsedChat {
  fileName: string
  chatName: string | null
  participants: { name: string; count: number }[]
  messages: ParsedMessage[]
  firstDate: string | null
  lastDate: string | null
}

// Inicio de mensaje: fecha + hora + (guion) + resto
const LINE_RX =
  /^\[?(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([aApP])?\.?\s*[mM]?\.?\]?\s*[-–]?\s*(.*)$/

const SYSTEM_HINTS = [
  "cifrados de extremo a extremo",
  "end-to-end encrypted",
  "creó el grupo",
  "cambió el asunto",
  "añadió",
  "saliste del grupo",
  "Tu código de seguridad",
]

function cleanLine(line: string): string {
  // WhatsApp mete marcas de dirección unicode invisibles
  return line.replace(/[‎‏‪-‮]/g, "").trimEnd()
}

function buildDate(d: number, m: number, y: number, h: number, min: number, s: number, ampm?: string): Date | null {
  if (y < 100) y += 2000
  // d/m por defecto (formato latino); si el "mes" es > 12, los campos vienen invertidos
  if (m > 12 && d <= 12) [d, m] = [m, d]
  if (m > 12 || d > 31) return null
  if (ampm) {
    const isPM = ampm.toLowerCase() === "p"
    if (isPM && h < 12) h += 12
    if (!isPM && h === 12) h = 0
  }
  const date = new Date(y, m - 1, d, h, min, s)
  return isNaN(date.getTime()) ? null : date
}

export function extractChatNameFromFile(fileName: string): string | null {
  const match = fileName.match(/(?:Chat de WhatsApp con|WhatsApp Chat with)\s+(.+?)\.txt$/i)
  return match ? match[1].trim() : null
}

export function parseWhatsAppExport(content: string, fileName: string): ParsedChat {
  const lines = content.split(/\r?\n/)
  const messages: ParsedMessage[] = []
  let current: { sender: string; text: string; date: Date } | null = null

  for (const rawLine of lines) {
    const line = cleanLine(rawLine)
    if (!line) continue

    const match = line.match(LINE_RX)
    if (match) {
      const [, d, m, y, h, min, s, ampm, rest] = match
      const date = buildDate(
        parseInt(d, 10), parseInt(m, 10), parseInt(y, 10),
        parseInt(h, 10), parseInt(min, 10), s ? parseInt(s, 10) : 0,
        ampm
      )

      // Separar "Remitente: texto" — los mensajes del sistema no tienen remitente
      const sepIdx = rest.indexOf(": ")
      if (!date || sepIdx <= 0) {
        // Línea de sistema (cifrado, cambios de grupo, etc.) — cerrar el mensaje actual
        if (current) {
          messages.push({ sender: current.sender, text: current.text, timestamp: current.date.toISOString() })
          current = null
        }
        continue
      }

      const sender = rest.slice(0, sepIdx).trim()
      let text = rest.slice(sepIdx + 2).trim()

      if (SYSTEM_HINTS.some((hint) => text.includes(hint))) continue
      if (text === "<Multimedia omitido>" || text === "<Media omitted>") text = "[Archivo multimedia]"
      if (text === "Se eliminó este mensaje." || text === "This message was deleted") text = "[Mensaje eliminado]"

      if (current) {
        messages.push({ sender: current.sender, text: current.text, timestamp: current.date.toISOString() })
      }
      current = { sender, text, date }
    } else if (current) {
      // Continuación de un mensaje multilínea
      current.text += "\n" + line
    }
  }

  if (current) {
    messages.push({ sender: current.sender, text: current.text, timestamp: current.date.toISOString() })
  }

  // Participantes ordenados por cantidad de mensajes
  const counts = new Map<string, number>()
  for (const msg of messages) {
    counts.set(msg.sender, (counts.get(msg.sender) || 0) + 1)
  }
  const participants = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return {
    fileName,
    chatName: extractChatNameFromFile(fileName),
    participants,
    messages,
    firstDate: messages.length > 0 ? messages[0].timestamp : null,
    lastDate: messages.length > 0 ? messages[messages.length - 1].timestamp : null,
  }
}

/** Detecta si un nombre de participante es en realidad un número de teléfono */
export function looksLikePhone(name: string): boolean {
  return /^\+?[\d\s\-().]{8,}$/.test(name.trim())
}

/** Normaliza un teléfono a solo dígitos (conserva el formato internacional sin +) */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "")
}
