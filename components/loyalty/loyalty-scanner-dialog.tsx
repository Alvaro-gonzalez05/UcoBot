"use client"

import { useEffect, useRef, useState } from "react"
import type { Html5Qrcode } from "html5-qrcode"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, CheckCircle2, CameraOff, RotateCw } from "lucide-react"

const SCANNER_ELEMENT_ID = "loyalty-qr-scanner"

/**
 * Extrae el loyalty_code de lo escaneado: acepta tanto la URL completa
 * de la tarjeta (https://dominio/tarjeta/<uuid>) como el UUID pelado.
 */
function extractLoyaltyCode(decoded: string): string | null {
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  const match = decoded.match(uuidRegex)
  return match ? match[0] : null
}

/** Espera a que el nodo del DOM exista (Radix monta el portal de forma asíncrona) */
function waitForElement(id: string, timeout = 3000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = () => {
      const el = document.getElementById(id)
      if (el) return resolve(el)
      if (Date.now() - start > timeout) return resolve(null)
      requestAnimationFrame(check)
    }
    check()
  })
}

type ScannerStatus = "loading" | "scanning" | "success" | "error"

export function LoyaltyScannerDialog({
  open,
  onOpenChange,
  onScan,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (loyaltyCode: string) => void
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const handledRef = useRef(false)
  const [status, setStatus] = useState<ScannerStatus>("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!open) return
    handledRef.current = false
    setStatus("loading")
    setErrorMsg("")

    let cancelled = false
    let scanner: Html5Qrcode | null = null

    const start = async () => {
      try {
        // 1. Esperar el nodo (evita el crash sincrónico de la librería)
        const el = await waitForElement(SCANNER_ELEMENT_ID)
        if (cancelled) return
        if (!el) {
          setStatus("error")
          setErrorMsg("No se pudo preparar el escáner. Reintentá.")
          return
        }

        // 2. Import dinámico para no romper SSR/bundle
        const mod = await import("html5-qrcode")
        if (cancelled) return

        scanner = new mod.Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false })
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (handledRef.current) return
            const code = extractLoyaltyCode(decodedText)
            if (!code) return
            handledRef.current = true
            setStatus("success")
            // Pequeña pausa para que se vea la animación de éxito
            setTimeout(() => {
              onScan(code)
              onOpenChange(false)
            }, 750)
          },
          () => {
            /* frames sin QR — ignorar */
          }
        )
        if (!cancelled) setStatus("scanning")
      } catch (err: any) {
        if (cancelled) return
        console.error("Scanner error:", err)
        setStatus("error")
        const name = err?.name || ""
        const isSecure = location.protocol === "https:" || location.hostname === "localhost"
        if (name === "NotAllowedError" || /permission|denied/i.test(String(err))) {
          setErrorMsg("Necesitamos permiso para la cámara. Habilitalo en el navegador y reintentá.")
        } else if (name === "NotFoundError" || /no camera|requested device/i.test(String(err))) {
          setErrorMsg("No se encontró ninguna cámara en este dispositivo.")
        } else if (!isSecure) {
          setErrorMsg("La cámara solo funciona en sitios seguros (HTTPS).")
        } else {
          setErrorMsg("No se pudo iniciar la cámara. Reintentá o buscá al cliente manualmente.")
        }
      }
    }

    start()

    return () => {
      cancelled = true
      const s = scannerRef.current
      scannerRef.current = null
      if (s) {
        // stop() puede rechazar si nunca llegó a arrancar — lo ignoramos
        s.stop().then(() => s.clear()).catch(() => {})
      }
    }
  }, [open, attempt])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Escanear tarjeta de fidelidad</DialogTitle>
          <DialogDescription>
            Apuntá la cámara al QR de la tarjeta del cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
          {/* Contenedor de la cámara (la librería inyecta el <video> acá) */}
          <div id={SCANNER_ELEMENT_ID} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

          {/* Marco guía + línea de escaneo */}
          {status === "scanning" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-56 w-56">
                {/* Esquinas */}
                {["top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
                  "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
                  "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
                  "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"].map((c, i) => (
                  <span key={i} className={`absolute h-8 w-8 border-[#D1F366] ${c}`} />
                ))}
                {/* Línea animada */}
                <motion.div
                  className="absolute left-2 right-2 h-0.5 rounded-full bg-[#D1F366] shadow-[0_0_12px_2px_rgba(209,243,102,0.8)]"
                  initial={{ top: "8px" }}
                  animate={{ top: ["8px", "216px", "8px"] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
            </div>
          )}

          {/* Estado: cargando */}
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-white">
              <Loader2 className="h-7 w-7 animate-spin" />
              <p className="text-xs text-white/70">Iniciando cámara…</p>
            </div>
          )}

          {/* Estado: éxito */}
          <AnimatePresence>
            {status === "success" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-emerald-600/90 text-white"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 16 }}
                >
                  <CheckCircle2 className="h-16 w-16" strokeWidth={2.5} />
                </motion.div>
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-sm font-bold"
                >
                  ¡Tarjeta detectada!
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Estado: error */}
          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white px-6 text-center">
              <CameraOff className="h-10 w-10 text-white/70" />
              <p className="text-xs text-white/80">{errorMsg}</p>
              <button
                onClick={() => setAttempt((a) => a + 1)}
                className="flex items-center gap-1.5 rounded-full bg-[#D1F366] px-4 py-2 text-xs font-bold text-[#1C1C28]"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Reintentar
              </button>
            </div>
          )}
        </div>

        {status === "scanning" && (
          <p className="text-center text-[11px] text-muted-foreground">
            Centrá el QR dentro del recuadro
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
