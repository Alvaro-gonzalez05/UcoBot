"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Banknote, CreditCard, Landmark, QrCode, CheckCircle2, Loader2, ShoppingBag } from "lucide-react"
import { motion } from "framer-motion"
import QRCode from "react-qr-code"
import { toast } from "sonner"

interface CheckoutOrder {
  id: string
  total_amount: number
  items: any[]
}

const PAYMENT_OPTIONS = [
  { id: "cash", label: "Efectivo", icon: Banknote },
  { id: "card", label: "Tarjeta", icon: CreditCard },
  { id: "transfer", label: "Transferencia", icon: Landmark },
  { id: "qr", label: "QR", icon: QrCode },
]

/**
 * Diálogo para cobrar/cerrar una venta desde /pedidos.
 * Muestra los productos, deja elegir medio de pago (con QR de Mercado Pago)
 * y finaliza la orden. No tiene "pasar pedido", solo finalizar.
 */
export function OrderCheckoutDialog({
  order,
  open,
  onOpenChange,
  onFinalized,
}: {
  order: CheckoutOrder | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onFinalized: (orderId: string) => void
}) {
  const supabase = createClient()
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mpQr, setMpQr] = useState<string | null>(null)
  const [mpQrLoading, setMpQrLoading] = useState(false)
  const [mpQrOrderId, setMpQrOrderId] = useState<string | null>(null)
  const [mpQrPaid, setMpQrPaid] = useState(false)

  const total = order?.total_amount || 0

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(value)

  // Al abrir/cerrar, reseteamos el estado del QR y el medio de pago
  useEffect(() => {
    if (!open) {
      setMpQr(null)
      setMpQrOrderId(null)
      setMpQrPaid(false)
      setPaymentMethod("cash")
    }
  }, [open])

  const finalizeSale = async () => {
    if (!order) return
    setIsSubmitting(true)
    try {
      const { error } = await supabase.from("orders").update({ status: "completed" }).eq("id", order.id)
      if (error) throw error
      toast.success("Venta finalizada")
      onFinalized(order.id)
      onOpenChange(false)
    } catch (error) {
      console.error("Error finalizing sale:", error)
      toast.error("No se pudo finalizar la venta")
    } finally {
      setIsSubmitting(false)
    }
  }

  const generateMpQr = async () => {
    if (total <= 0) {
      toast.error("El total es 0")
      return
    }
    setMpQrLoading(true)
    setMpQrPaid(false)
    setMpQrOrderId(null)
    try {
      const res = await fetch("/api/mp/create-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(total.toFixed(2)) }),
      })
      const j = await res.json()
      if (!res.ok || !j.qr_data) {
        toast.error(j.error || "No se pudo generar el QR")
        return
      }
      setMpQr(j.qr_data)
      setMpQrOrderId(j.order_id || null)
    } catch {
      toast.error("Error de red al generar el QR")
    } finally {
      setMpQrLoading(false)
    }
  }

  // Polling del pago del QR
  useEffect(() => {
    if (!mpQr || !mpQrOrderId || mpQrPaid) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/mp/qr-status?orderId=${mpQrOrderId}`)
        const j = await res.json()
        if (j.paid) {
          setMpQrPaid(true)
          clearInterval(interval)
        }
      } catch {
        /* reintenta */
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [mpQr, mpQrOrderId, mpQrPaid])

  // Al pagarse el QR: animación + finalizar
  useEffect(() => {
    if (!mpQrPaid) return
    const t = setTimeout(() => {
      finalizeSale()
    }, 1800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpQrPaid])

  const isQr = paymentMethod === "qr"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-600" />
            Cobrar {formatCurrency(total)}
          </DialogTitle>
        </DialogHeader>

        {/* Estado QR: esperando o pagado */}
        {mpQr ? (
          mpQrPaid ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 14 }}
                className="relative"
              >
                <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
                <CheckCircle2 className="relative h-20 w-20 text-emerald-500" />
              </motion.div>
              <p className="text-lg font-bold">¡Pago recibido!</p>
              <p className="text-sm text-muted-foreground">Finalizando la venta…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="rounded-xl bg-white p-4">
                <QRCode value={mpQr} size={220} />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                El cliente escanea con <strong>cualquier billetera</strong> y paga. Te avisamos cuando se acredite.
              </p>
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Esperando el pago…
              </span>
              <Button variant="ghost" size="sm" onClick={() => { setMpQr(null); setMpQrOrderId(null) }}>
                Volver
              </Button>
            </div>
          )
        ) : (
          <div className="space-y-4">
            {/* Productos */}
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {Array.isArray(order?.items) && order!.items.length > 0 ? (
                order!.items.map((item: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 rounded-2xl bg-muted/40 p-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name || item.product_name || `Producto ${i + 1}`}</p>
                      <p className="text-xs text-muted-foreground">{item.quantity}x · {formatCurrency(Number(item.price) || 0)}</p>
                    </div>
                    <p className="text-sm font-semibold">{formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 1))}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Sin productos</p>
              )}
            </div>

            {/* Medio de pago */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Método de pago</p>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_OPTIONS.map((option) => {
                  const Icon = option.icon
                  const active = paymentMethod === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setPaymentMethod(option.id)}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-xl border px-2 py-2 text-xs font-semibold transition-all",
                        active
                          ? "border-transparent bg-[#1f2030] text-[#d8ff55] shadow-md"
                          : "border-border bg-card text-muted-foreground hover:border-foreground/30"
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Total</span>
              <span className="text-2xl font-black">{formatCurrency(total)}</span>
            </div>

            {/* Acción */}
            {isQr ? (
              <Button
                onClick={generateMpQr}
                disabled={mpQrLoading}
                className="h-12 w-full rounded-xl bg-[#009ee3] text-sm font-bold uppercase tracking-[0.2em] text-white hover:bg-[#0089c7]"
              >
                {mpQrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>Cobrar con QR <QrCode className="ml-2 h-4 w-4" /></>)}
              </Button>
            ) : (
              <Button
                onClick={finalizeSale}
                disabled={isSubmitting}
                className="h-12 w-full rounded-xl bg-[#d8ff55] text-sm font-bold uppercase tracking-[0.25em] text-slate-900 hover:bg-[#c8ef42]"
              >
                {isSubmitting ? "Procesando..." : "Finalizar venta"}
                <CheckCircle2 className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
