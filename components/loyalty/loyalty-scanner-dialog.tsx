"use client"

import { useEffect, useRef } from "react"
import { Html5Qrcode } from "html5-qrcode"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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

  useEffect(() => {
    if (!open) return
    handledRef.current = false

    let cancelled = false
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID)
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (handledRef.current) return
          const code = extractLoyaltyCode(decodedText)
          if (code) {
            handledRef.current = true
            onScan(code)
            onOpenChange(false)
          }
        },
        () => {
          // errores de frame sin QR — ignorar
        }
      )
      .catch((err) => {
        if (!cancelled) console.error("No se pudo iniciar la cámara:", err)
      })

    return () => {
      cancelled = true
      const s = scannerRef.current
      scannerRef.current = null
      if (s) {
        s.stop().then(() => s.clear()).catch(() => {})
      }
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Escanear tarjeta de fidelidad</DialogTitle>
          <DialogDescription>
            Apuntá la cámara al QR de la tarjeta del cliente.
          </DialogDescription>
        </DialogHeader>
        <div
          id={SCANNER_ELEMENT_ID}
          className="w-full overflow-hidden rounded-2xl bg-black [&_video]:w-full"
        />
      </DialogContent>
    </Dialog>
  )
}
