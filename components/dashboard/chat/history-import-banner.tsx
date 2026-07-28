"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, MessageSquareText } from "lucide-react"

/**
 * Barra de progreso de la importación inicial de chats (coexistencia).
 *
 * Va arriba de la lista de conversaciones. Aparece sola cuando hay una
 * importación en curso, muestra el avance, y al terminar hace una animación de
 * "listo" antes de desaparecer. Si no hay nada importándose no ocupa lugar.
 */

type SyncStatus = {
  active: boolean
  justFinished: boolean
  progress?: number
  done?: number
  total?: number
  eta_seconds?: number | null
}

/**
 * Tiempo restante en palabras. Redondeado a propósito: la estimación sale de un
 * promedio y prometer "3 min 20 s" sería más preciso de lo que realmente es.
 */
function formatEta(seconds: number): string {
  if (seconds < 90) return "menos de un minuto"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `~${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `~${hours} h` : `~${hours} h ${rest} min`
}

export function HistoryImportBanner() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [showDone, setShowDone] = useState(false)
  // Para detectar el flanco activo → terminado y disparar la animación una vez.
  const wasActiveRef = useRef(false)
  // El total no se conoce de antemano: mientras se procesa la cola, WhatsApp sigue
  // mandando mensajes viejos y el denominador crece. Sin este tope el porcentaje
  // retrocedía cada vez que entraba una tanda nueva, que es lo que se veía como
  // "el loader volvió a 0". Se guarda el máximo alcanzado y solo se reinicia
  // cuando arranca una importación nueva.
  const maxProgressRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      try {
        const res = await fetch("/api/whatsapp/ycloud/sync/status")
        if (!res.ok) return
        const json: SyncStatus = await res.json()
        if (cancelled) return

        setStatus(json)

        // Importación nueva (venía quieto y arrancó): el tope empieza de cero.
        if (!wasActiveRef.current && json.active) maxProgressRef.current = 0

        if (wasActiveRef.current && !json.active) {
          // Terminó: mostramos el "listo" y lo escondemos a los 4 segundos.
          setShowDone(true)
          setTimeout(() => !cancelled && setShowDone(false), 4000)
        }
        wasActiveRef.current = json.active
      } catch {
        /* silencioso: esto no debe molestar al chat */
      } finally {
        if (!cancelled) {
          // Rápido mientras importa, lento cuando no pasa nada.
          timer = setTimeout(poll, wasActiveRef.current ? 3000 : 30000)
        }
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  const importing = status?.active === true
  const visible = importing || showDone || (status?.justFinished === true && showDone)

  const reported = Math.max(0, Math.min(100, status?.progress ?? 0))
  if (reported > maxProgressRef.current) maxProgressRef.current = reported
  const progress = importing ? maxProgressRef.current : reported

  // Con importaciones largas el porcentaje se mueve poco; el contador de mensajes
  // es lo que muestra que efectivamente está avanzando.
  const counter =
    importing && status?.total
      ? `${(status.done ?? 0).toLocaleString("es-AR")} de ${status.total.toLocaleString("es-AR")} mensajes`
      : null

  const eta =
    importing && status?.eta_seconds ? `falta ${formatEta(status.eta_seconds)}` : null
  const subtitle = [counter, eta].filter(Boolean).join(" · ")

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: "auto", marginBottom: 8 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="overflow-hidden px-3"
        >
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
            <div className="flex items-center gap-2.5">
              <AnimatePresence mode="wait">
                {importing ? (
                  <motion.div
                    key="loading"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    className="w-7 h-7 rounded-lg bg-[#D1F366]/20 text-[#1C1C28] dark:text-[#D1F366] flex items-center justify-center flex-shrink-0"
                  >
                    <MessageSquareText className="w-3.5 h-3.5" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="done"
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: [0.4, 1.2, 1], opacity: 1 }}
                    transition={{ duration: 0.45 }}
                    className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center flex-shrink-0"
                  >
                    <Check className="w-4 h-4" />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate">
                  {importing ? "Trayendo tus chats…" : "¡Listo! Ya están tus chats"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {importing
                    ? subtitle || "Podés seguir usando el chat mientras tanto"
                    : "Las conversaciones viejas quedaron con su fecha original"}
                </p>
              </div>

              {importing && (
                <span className="text-xs font-bold tabular-nums text-muted-foreground flex-shrink-0">
                  {progress}%
                </span>
              )}
            </div>

            <div className="mt-2 h-1.5 rounded-full bg-border/70 overflow-hidden">
              <motion.div
                className={importing ? "h-full bg-[#D1F366]" : "h-full bg-emerald-500"}
                initial={false}
                animate={{ width: importing ? `${progress}%` : "100%" }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
