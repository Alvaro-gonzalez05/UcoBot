/**
 * Sonidos de la app, generados con Web Audio (sin archivos).
 *
 * Son avisos de menos de un segundo: no justifican una descarga, no suman peso al
 * bundle y no dependen de que un mp3 cargue a tiempo.
 *
 * Dos sonidos con trabajos distintos, a propósito diferentes entre sí:
 *   · Mensaje de chat ("Burbuja")  → feedback liviano, solo con la ventana a la vista
 *   · Pedido nuevo ("Arpegio")     → aviso de trabajo, suena aunque estés en otra pestaña
 */

type Direction = "in" | "out"

let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    // El navegador deja el audio suspendido hasta que hay una interacción del usuario
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Nota con su armónico: la base del aviso de pedido. */
function tone(
  audio: AudioContext,
  t0: number,
  freq: number,
  vol: number,
  dur: number,
  type: OscillatorType = "sine",
  harmonic = 0.25
) {
  for (const [f, v] of [[freq, vol], [freq * 2.01, vol * harmonic]] as const) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(f, t0)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(v, t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(gain).connect(audio.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }
}

/**
 * Mensaje de chat. `in` (entra del cliente) sube de tono, `out` (sale nuestro) baja.
 * Solo suena con la ventana a la vista: es feedback, no un aviso.
 */
export function playMessageSound(direction: Direction = "in") {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return

  const audio = getContext()
  if (!audio || audio.state !== "running") return

  try {
    const t0 = audio.currentTime + 0.01
    const from = direction === "out" ? 700 : 300
    const to = direction === "out" ? 260 : 900

    const osc = audio.createOscillator()
    const gain = audio.createGain()

    osc.type = "sine"
    osc.frequency.setValueAtTime(from, t0)
    osc.frequency.exponentialRampToValueAtTime(to, t0 + 0.1)

    // Volumen bajo a propósito: esto suena decenas de veces por día.
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.13, t0 + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13)

    osc.connect(gain).connect(audio.destination)
    osc.start(t0)
    osc.stop(t0 + 0.17)
  } catch {
    /* si el navegador bloquea el audio, seguimos sin sonido */
  }
}

/**
 * Pedido nuevo: tres notas ascendentes (Do–Mi–La), la última con más cola.
 * A diferencia del chat, NO se calla en segundo plano: avisa que entró trabajo
 * aunque el cajero esté en otra pestaña.
 */
export function playNewOrderSound() {
  const audio = getContext()
  if (!audio || audio.state !== "running") return

  try {
    const t0 = audio.currentTime + 0.01
    const notes = [523.25, 659.25, 880]
    notes.forEach((f, i) => {
      // La última nota queda sonando un poco más: cierra el aviso
      tone(audio, t0 + i * 0.075, f, 0.13, i === notes.length - 1 ? 0.45 : 0.18, "sine", 0.25)
    })
  } catch {
    /* silencioso si el navegador lo bloquea */
  }
}

/**
 * Habilita el audio con el primer gesto del usuario (click o tecla). Sin esto, el
 * primer aviso no suena porque el navegador todavía no autorizó el audio.
 */
export function primeSounds() {
  if (typeof window === "undefined") return () => {}
  const unlock = () => {
    getContext()
    window.removeEventListener("pointerdown", unlock)
    window.removeEventListener("keydown", unlock)
  }
  window.addEventListener("pointerdown", unlock, { once: true })
  window.addEventListener("keydown", unlock, { once: true })
  return () => {
    window.removeEventListener("pointerdown", unlock)
    window.removeEventListener("keydown", unlock)
  }
}
