/**
 * Horarios de atención: formateo legible y si el negocio está abierto ahora.
 *
 * Vive acá porque lo necesitan el prompt del bot, el bloqueo de pedidos fuera de
 * hora y la configuración del bot. Antes el prompt solo recibía "5 días abierto",
 * así que el asistente literalmente no podía decir a qué hora abre.
 */

export interface DayHours {
  open?: string
  close?: string
  isOpen?: boolean
}

export type BusinessHours = Record<string, DayHours>

/** Orden real de la semana: el objeto guardado no respeta ninguno. */
const DAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

const DAY_NAMES: Record<string, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
}

/** "09:00" → "9", "09:30" → "9:30". Los ":00" sobran al leerlo. */
function prettyTime(t?: string): string {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = String(Number(h))
  return m && m !== '00' ? `${hour}:${m}` : hour
}

/**
 * Listado legible, agrupando días seguidos con el mismo horario.
 *
 * Sin agrupar salen siete renglones casi idénticos; agrupado queda
 * "Lunes a viernes de 9 a 18", que es como lo diría una persona.
 */
export function formatBusinessHours(hours?: BusinessHours | null): string[] {
  if (!hours || typeof hours !== 'object') return []

  const days = DAY_ORDER.map((key) => ({
    key,
    name: DAY_NAMES[key],
    info: hours[key],
  }))

  const lines: string[] = []
  let i = 0

  while (i < days.length) {
    const current = days[i]
    const open = current.info?.isOpen
    const range = open ? `${current.info?.open}-${current.info?.close}` : 'cerrado'

    // Hasta dónde llega la racha de días con el MISMO estado y horario.
    let j = i
    while (j + 1 < days.length) {
      const next = days[j + 1]
      const nextOpen = next.info?.isOpen
      const nextRange = nextOpen ? `${next.info?.open}-${next.info?.close}` : 'cerrado'
      if (nextOpen !== open || nextRange !== range) break
      j++
    }

    // Los días cerrados no se listan: el horario se lee mejor diciendo solo cuándo
    // se atiende. Que falte un día ya significa que está cerrado.
    if (open) {
      const label =
        i === j
          ? current.name
          : j === i + 1
            ? `${current.name} y ${days[j].name}`
            : `${current.name} a ${days[j].name}`
      lines.push(`${label}: ${prettyTime(current.info?.open)} a ${prettyTime(current.info?.close)} hs`)
    }

    i = j + 1
  }

  return lines
}

/** Una línea corta, para meter en un prompt sin ocupar media pantalla. */
export function businessHoursOneLine(hours?: BusinessHours | null): string {
  const lines = formatBusinessHours(hours)
  return lines.length > 0 ? lines.join(' · ') : 'No especificado'
}

/**
 * ¿El negocio está abierto en este momento?
 *
 * `null` cuando no hay horarios cargados: no es lo mismo que estar cerrado, y
 * quien llame tiene que poder distinguirlo para no bloquear a un negocio que
 * simplemente nunca configuró sus horarios.
 */
export function isOpenNow(hours?: BusinessHours | null, now = new Date()): boolean | null {
  if (!hours || typeof hours !== 'object') return null

  const anyConfigured = DAY_ORDER.some((d) => hours[d]?.isOpen)
  if (!anyConfigured) return null

  // getDay(): 0 = domingo. DAY_ORDER arranca en lunes.
  const key = DAY_ORDER[(now.getDay() + 6) % 7]
  const today = hours[key]
  if (!today?.isOpen || !today.open || !today.close) return false

  const [oh, om] = today.open.split(':').map(Number)
  const [ch, cm] = today.close.split(':').map(Number)
  const minutes = now.getHours() * 60 + now.getMinutes()
  const openMin = oh * 60 + (om || 0)
  const closeMin = ch * 60 + (cm || 0)

  // Cierre después de medianoche (ej. 20:00 a 02:00): el rango cruza el día.
  if (closeMin <= openMin) return minutes >= openMin || minutes < closeMin
  return minutes >= openMin && minutes < closeMin
}
