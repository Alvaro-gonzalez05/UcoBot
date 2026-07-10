"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SheetGrabBar } from "@/components/ui/sheet-grab-bar"
import { Banknote, CreditCard, Landmark, QrCode, CheckCircle2, Loader2, ShoppingBag, Users, ChevronLeft, Check, Minus } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import QRCode from "react-qr-code"
import { toast } from "sonner"

interface CheckoutOrder {
  id: string
  total_amount: number
  items: any[]
  payments?: PaymentRecord[]
  tip_amount?: number
  source?: string
  status?: string
}

export interface PaymentRecord {
  method: string
  label?: string
  amount: number
  /** Nombres de las unidades cubiertas por este pago (para pago dividido) */
  items?: string[]
  /** Vuelto que el cliente dejó de propina en este pago */
  tip?: number
}

// Formato de miles para inputs de efectivo: "10000" → "10.000"
const formatMiles = (raw: string) => {
  const digits = raw.replace(/[^\d]/g, "")
  if (!digits) return ""
  return Number(digits).toLocaleString("es-AR")
}
const parseMiles = (s: string) => Number(s.replace(/\./g, "")) || 0

const PAYMENT_OPTIONS = [
  { id: "cash", label: "Efectivo", icon: Banknote },
  { id: "card", label: "Tarjeta", icon: CreditCard },
  { id: "transfer", label: "Transferencia", icon: Landmark },
  { id: "qr", label: "QR", icon: QrCode },
]

// En pago dividido el QR queda afuera (requiere esperar acreditación por cada parte)
const SPLIT_PAYMENT_OPTIONS = PAYMENT_OPTIONS.filter((o) => o.id !== "qr")

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(value)

interface SplitItem {
  idx: number
  name: string
  price: number
  qty: number
  image_url?: string | null
}

// Items normalizados para el pago dividido (mismo formato visual que el carrito)
function buildSplitItems(items: any[] | undefined): SplitItem[] {
  const out: SplitItem[] = []
  ;(items ?? []).forEach((it: any, idx: number) => {
    const price = Number(it.price) || 0
    const qty = Math.max(1, Number(it.quantity) || 1)
    if (price < 0) return // líneas de descuento no se dividen entre personas
    out.push({ idx, name: it.name || it.product_name || `Producto ${idx + 1}`, price, qty, image_url: it.image_url || null })
  })
  return out
}

interface Group extends PaymentRecord {
  /** Unidades pagadas por item en este grupo: { itemIdx: cantidad } */
  counts: Record<number, number>
}

// Reconstruye grupos pagados desde la DB (matchea unidades por nombre)
function rebuildGroups(splitItems: SplitItem[], initial: PaymentRecord[] | undefined): Group[] {
  const groups: Group[] = []
  const consumed: Record<number, number> = {}
  for (const p of initial ?? []) {
    if (!p.items?.length) continue
    const counts: Record<number, number> = {}
    for (const label of p.items) {
      const item = splitItems.find(
        (si) => si.name === label && (consumed[si.idx] || 0) + (counts[si.idx] || 0) < si.qty
      )
      if (item) counts[item.idx] = (counts[item.idx] || 0) + 1
    }
    for (const [k, v] of Object.entries(counts)) consumed[Number(k)] = (consumed[Number(k)] || 0) + v
    groups.push({ method: p.method, label: p.label, amount: p.amount, items: p.items, counts })
  }
  return groups
}

/**
 * Panel de cobro reutilizable: pago único (con QR de Mercado Pago) o pago
 * dividido (cada cliente paga lo suyo, con métodos distintos). Lo usan el
 * diálogo standalone y el modal de detalle del pedido.
 */
export function OrderCheckoutPanel({
  total,
  items,
  showItems = true,
  initialPayments,
  onFinalize,
  onPaymentsChange,
}: {
  total: number
  items?: any[]
  showItems?: boolean
  /** Pagos parciales ya registrados (para retomar un pago dividido a medias) */
  initialPayments?: PaymentRecord[]
  onFinalize: (payments: PaymentRecord[]) => Promise<void> | void
  /** Persistencia incremental de pagos parciales (para no perder plata ya cobrada) */
  onPaymentsChange?: (payments: PaymentRecord[]) => void
}) {
  const splitItems = buildSplitItems(items)

  const [groups, setGroups] = useState<Group[]>(() => rebuildGroups(splitItems, initialPayments))
  const [mode, setMode] = useState<"single" | "split">(() =>
    rebuildGroups(splitItems, initialPayments).length > 0 ? "split" : "single"
  )
  // Unidades seleccionadas por item para la tanda actual: { itemIdx: cantidad }
  const [selected, setSelected] = useState<Record<number, number>>({})
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [splitMethod, setSplitMethod] = useState("cash")
  // "¿Con cuánto paga?" para efectivo (calcula el vuelto; el excedente puede quedar de propina)
  const [cashPaid, setCashPaid] = useState("")
  const [splitCashPaid, setSplitCashPaid] = useState("")
  const [cashTipMode, setCashTipMode] = useState<"change" | "tip">("change")
  const [splitTipMode, setSplitTipMode] = useState<"change" | "tip">("change")
  // Animación de venta completada (fondo verde + check)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mpQr, setMpQr] = useState<string | null>(null)
  const [mpQrLoading, setMpQrLoading] = useState(false)
  const [mpQrOrderId, setMpQrOrderId] = useState<string | null>(null)
  const [mpQrPaid, setMpQrPaid] = useState(false)

  const paidCountFor = (idx: number) => groups.reduce((s, g) => s + (g.counts[idx] || 0), 0)
  const paidAmount = groups.reduce((s, g) => s + g.amount, 0)
  const remaining = Math.max(0, Math.round((total - paidAmount) * 100) / 100)
  const allPaid = splitItems.length > 0 && splitItems.every((si) => paidCountFor(si.idx) >= si.qty)
  const selectedCount = Object.values(selected).reduce((s, n) => s + n, 0)
  const selectedTotal = splitItems.reduce((s, si) => s + (selected[si.idx] || 0) * si.price, 0)

  const cashPaidNum = parseMiles(cashPaid)
  const splitCashPaidNum = parseMiles(splitCashPaid)
  const cashSurplus = Math.max(0, cashPaidNum - total)
  const splitSurplus = Math.max(0, splitCashPaidNum - selectedTotal)
  const tipsTotal = groups.reduce((s, g) => s + (g.tip || 0), 0)

  const toRecords = (gs: Group[]): PaymentRecord[] =>
    gs.map(({ method, label, amount, items: it, tip }) => ({ method, label, amount, items: it, tip }))

  const handleFinalize = async (payments: PaymentRecord[]) => {
    setIsSubmitting(true)
    try {
      await onFinalize(payments)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Muestra la animación de confirmación (fondo verde + check) y después finaliza
  const finalizeWithSuccess = (payments: PaymentRecord[]) => {
    setShowSuccess(true)
    setTimeout(() => {
      handleFinalize(payments)
    }, 1400)
  }

  // Tocar un item suma 1 unidad a la tanda (hasta agotar lo que falta pagar)
  const tapItem = (si: SplitItem) => {
    const available = si.qty - paidCountFor(si.idx) - (selected[si.idx] || 0)
    if (available <= 0) return
    setSelected((prev) => ({ ...prev, [si.idx]: (prev[si.idx] || 0) + 1 }))
  }

  const decreaseItem = (idx: number) => {
    setSelected((prev) => {
      const next = { ...prev }
      if ((next[idx] || 0) <= 1) delete next[idx]
      else next[idx] = next[idx] - 1
      return next
    })
  }

  // Cobra las unidades seleccionadas con el método elegido
  const paySelected = () => {
    if (selectedCount === 0) return
    const opt = SPLIT_PAYMENT_OPTIONS.find((o) => o.id === splitMethod)
    const unpaidTotalUnits = splitItems.reduce((s, si) => s + (si.qty - paidCountFor(si.idx)), 0)
    const isLastBatch = selectedCount === unpaidTotalUnits
    // El último cobro ajusta al restante exacto (evita diferencias de redondeo/descuentos)
    const amount = isLastBatch ? remaining : Math.round(selectedTotal * 100) / 100
    const labels = splitItems.flatMap((si) => Array(selected[si.idx] || 0).fill(si.name))
    // Propina: si pagó de más y marcó "dejar de propina", el excedente se registra (cualquier método)
    const tip = splitTipMode === "tip" && splitSurplus > 0 ? Math.round(splitSurplus * 100) / 100 : undefined
    const group: Group = {
      method: splitMethod,
      label: opt?.label || splitMethod,
      amount,
      items: labels,
      counts: { ...selected },
      tip,
    }
    const next = [...groups, group]
    setGroups(next)
    setSelected({})
    setSplitCashPaid("")
    setSplitTipMode("change")
    onPaymentsChange?.(toRecords(next))
    if (isLastBatch) {
      // Último cobro: el pedido queda pago completo → se finaliza solo, con animación
      finalizeWithSuccess(toRecords(next))
    } else {
      toast.success(`${opt?.label || splitMethod}: ${formatCurrency(amount + (tip || 0))} cobrado${tip ? ` (incluye ${formatCurrency(tip)} de propina)` : ""}`)
    }
  }

  const undoLastGroup = () => {
    if (groups.length === 0) return
    const next = groups.slice(0, -1)
    setGroups(next)
    onPaymentsChange?.(toRecords(next))
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
      // El QR cobra total + propina (si puso un monto mayor y lo marcó como propina)
      const qrAmount = cashTipMode === "tip" && cashSurplus > 0 ? total + cashSurplus : total
      const res = await fetch("/api/mp/create-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(qrAmount.toFixed(2)) }),
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
      const tip = cashTipMode === "tip" && cashSurplus > 0 ? Math.round(cashSurplus * 100) / 100 : undefined
      handleFinalize([{ method: "qr", label: "QR MercadoPago", amount: Number(total.toFixed(2)), tip }])
    }, 1800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpQrPaid])

  const isQr = paymentMethod === "qr"

  // ─── Venta completada: fondo verde + check animado ───
  if (showSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-emerald-500 py-16 text-white shadow-lg"
      >
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.15 }}
          className="relative"
        >
          <span className="absolute inset-0 rounded-full bg-white/25 animate-ping" />
          <CheckCircle2 className="relative h-24 w-24" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="text-xl font-black tracking-wide"
        >
          ¡Venta completada!
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-sm text-white/85 font-semibold"
        >
          {formatCurrency(total + tipsTotal)}{tipsTotal > 0 ? ` · incluye ${formatCurrency(tipsTotal)} de propina` : ""}
        </motion.p>
      </motion.div>
    )
  }

  // Estado QR: esperando o pagado
  if (mpQr) {
    return mpQrPaid ? (
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
          <QRCode value={mpQr} size={200} />
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
  }

  // ─── Modo pago dividido ───
  if (mode === "split") {
    return (
      <div className="space-y-3">
        {/* Progreso */}
        <div className="rounded-2xl bg-muted/40 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-muted-foreground">Pagado</span>
            <span className="font-bold">{formatCurrency(paidAmount)} <span className="text-muted-foreground font-normal">de {formatCurrency(total)}</span></span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-emerald-500"
              animate={{ width: `${total > 0 ? Math.min(100, (paidAmount / total) * 100) : 0}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
          {groups.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {groups.map((g, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[10px] font-bold text-foreground shadow-sm">
                  <Check className="h-3 w-3 text-emerald-500" />
                  {g.label}: pagó {formatCurrency(g.amount + (g.tip || 0))}
                  {g.tip ? <span className="font-medium text-muted-foreground">({formatCurrency(g.tip)} de propina)</span> : null}
                </span>
              ))}
              {tipsTotal > 0 && (
                <span className="w-full text-right text-[11px] font-bold text-foreground">Propinas totales: {formatCurrency(tipsTotal)}</span>
              )}
              <button type="button" onClick={undoLastGroup} className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
                deshacer último
              </button>
            </div>
          )}
        </div>

        {/* Items estilo carrito: tocá para sumar 1 unidad a esta tanda */}
        <div className="max-h-60 space-y-2.5 overflow-y-auto pr-1">
          {splitItems.map((si) => {
            const paid = paidCountFor(si.idx)
            const sel = selected[si.idx] || 0
            const fullyPaid = paid >= si.qty
            return (
              <button
                key={si.idx}
                type="button"
                disabled={fullyPaid}
                onClick={() => tapItem(si)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all",
                  fullyPaid
                    ? "bg-muted/25 opacity-55"
                    : sel > 0
                      ? "bg-[#D1F366]/15 ring-1 ring-[#B3D93C] shadow-sm"
                      : "bg-muted/40 hover:bg-muted/60 active:scale-[0.99]"
                )}
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted flex items-center justify-center">
                  {si.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={si.image_url} alt={si.name} className="h-full w-full object-cover" />
                  ) : (
                    <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                  )}
                  {fullyPaid && (
                    <span className="absolute inset-0 flex items-center justify-center bg-emerald-500/70">
                      <Check className="h-6 w-6 text-white" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className={cn("text-sm font-semibold leading-tight line-clamp-2", fullyPaid && "line-through")}>{si.name}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(si.price)} / ud{si.qty > 1 ? ` · x${si.qty}` : ""}</p>
                  {paid > 0 && !fullyPaid && (
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{paid} de {si.qty} pagadas</p>
                  )}
                  {fullyPaid && (
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">Pagado</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 self-center">
                  {sel > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); decreaseItem(si.idx) }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); decreaseItem(si.idx) } }}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-background text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Minus className="h-3 w-3" />
                      </span>
                      <span className="rounded-full bg-[#D1F366] px-2 py-0.5 text-[10px] font-bold text-[#1C1C28]">
                        {sel} pagando
                      </span>
                    </span>
                  )}
                  <p className="text-sm font-bold">{formatCurrency(sel > 0 ? sel * si.price : si.price * si.qty)}</p>
                </div>
              </button>
            )
          })}
        </div>

        {!allPaid ? (
          <>
            {/* Método para esta tanda */}
            <div className="grid grid-cols-3 gap-2">
              {SPLIT_PAYMENT_OPTIONS.map((option) => {
                const Icon = option.icon
                const active = splitMethod === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSplitMethod(option.id)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2.5 text-[11px] font-semibold transition-all",
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

            {/* Con cuánto paga esta tanda → el excedente puede quedar de propina */}
            <AnimatePresence initial={false}>
              {selectedCount > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-xl bg-muted/40 p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={splitCashPaid}
                        onChange={(e) => setSplitCashPaid(formatMiles(e.target.value))}
                        placeholder="¿Con cuánto paga?"
                        className="h-9 rounded-lg text-sm"
                      />
                      <span className={cn(
                        "shrink-0 text-xs font-bold",
                        splitCashPaidNum >= selectedTotal ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                      )}>
                        {splitTipMode === "tip" && splitSurplus > 0
                          ? `Propina: ${formatCurrency(splitSurplus)}`
                          : `Vuelto: ${formatCurrency(splitSurplus)}`}
                      </span>
                    </div>
                    {splitSurplus > 0 && (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSplitTipMode("change")}
                          className={cn(
                            "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-all",
                            splitTipMode === "change"
                              ? "border-transparent bg-[#1f2030] text-[#d8ff55]"
                              : "border-border bg-card text-muted-foreground"
                          )}
                        >
                          Dar vuelto
                        </button>
                        <button
                          type="button"
                          onClick={() => setSplitTipMode("tip")}
                          className={cn(
                            "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-all",
                            splitTipMode === "tip"
                              ? "border-transparent bg-emerald-500 text-white"
                              : "border-border bg-card text-muted-foreground"
                          )}
                        >
                          Dejar de propina
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              onClick={paySelected}
              disabled={selectedCount === 0}
              className="h-11 w-full rounded-xl bg-emerald-500 text-sm font-bold text-white hover:bg-emerald-600"
            >
              Cobrar seleccionado {selectedCount > 0 && `(${formatCurrency(selectedTotal)})`}
            </Button>
          </>
        ) : (
          <Button
            onClick={() => finalizeWithSuccess(toRecords(groups))}
            disabled={isSubmitting}
            className="h-12 w-full rounded-xl bg-[#d8ff55] text-sm font-bold uppercase tracking-[0.25em] text-slate-900 hover:bg-[#c8ef42]"
          >
            {isSubmitting ? "Procesando..." : "Finalizar venta"}
            <CheckCircle2 className="ml-2 h-4 w-4" />
          </Button>
        )}

        {groups.length === 0 && (
          <button
            type="button"
            onClick={() => { setMode("single"); setSelected({}) }}
            className="mx-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Volver a pago único
          </button>
        )}
      </div>
    )
  }

  // ─── Modo pago único ───
  return (
    <div className="space-y-4">
      {/* Productos (opcional) */}
      {showItems && (
        <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
          {Array.isArray(items) && items.length > 0 ? (
            items.map((item: any, i: number) => (
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
      )}

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
                  "flex items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-all",
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

      {/* Con cuánto paga → el excedente puede quedar de propina (todos los métodos) */}
      <div>
            <div className="rounded-xl bg-muted/40 p-2 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={cashPaid}
                  onChange={(e) => setCashPaid(formatMiles(e.target.value))}
                  placeholder="¿Con cuánto paga?"
                  className="h-9 rounded-lg text-sm"
                />
                <span className={cn(
                  "shrink-0 text-xs font-bold",
                  cashPaidNum >= total ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                )}>
                  {cashTipMode === "tip" && cashSurplus > 0
                    ? `Propina: ${formatCurrency(cashSurplus)}`
                    : `Vuelto: ${formatCurrency(cashSurplus)}`}
                </span>
              </div>
              {cashSurplus > 0 && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCashTipMode("change")}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-all",
                      cashTipMode === "change"
                        ? "border-transparent bg-[#1f2030] text-[#d8ff55]"
                        : "border-border bg-card text-muted-foreground"
                    )}
                  >
                    Dar vuelto
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashTipMode("tip")}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-all",
                      cashTipMode === "tip"
                        ? "border-transparent bg-emerald-500 text-white"
                        : "border-border bg-card text-muted-foreground"
                    )}
                  >
                    Dejar de propina
                  </button>
                </div>
              )}
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
          onClick={() => {
            const opt = PAYMENT_OPTIONS.find((o) => o.id === paymentMethod)
            const tip = cashTipMode === "tip" && cashSurplus > 0 ? Math.round(cashSurplus * 100) / 100 : undefined
            finalizeWithSuccess([{ method: paymentMethod, label: opt?.label || paymentMethod, amount: Number(total.toFixed(2)), tip }])
          }}
          disabled={isSubmitting}
          className="h-12 w-full rounded-xl bg-[#d8ff55] text-sm font-bold uppercase tracking-[0.25em] text-slate-900 hover:bg-[#c8ef42]"
        >
          {isSubmitting ? "Procesando..." : "Finalizar venta"}
          <CheckCircle2 className="ml-2 h-4 w-4" />
        </Button>
      )}

      {/* Pago dividido: cada cliente paga lo suyo */}
      {splitItems.reduce((s, si) => s + si.qty, 0) > 1 && (
        <button
          type="button"
          onClick={() => setMode("split")}
          className="mx-auto flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <Users className="h-3.5 w-3.5" /> Cobrar por separado
        </button>
      )}
    </div>
  )
}

/**
 * Diálogo standalone para cobrar/cerrar una venta desde las tarjetas de /pedidos.
 */
export function OrderCheckoutDialog({
  order,
  open,
  onOpenChange,
  onFinalized,
  tipEnabled = false,
  tipPercent = 10,
}: {
  order: CheckoutOrder | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onFinalized: (orderId: string) => void
  tipEnabled?: boolean
  tipPercent?: number
}) {
  const supabase = createClient()

  // Propina recalculada sobre el total actual para pedidos del POS aún sin cobrar
  // La propina NO se auto-suma. Se cobra el total del pedido; la propina se
  // agrega solo si el cajero deja el vuelto como propina al pagar en efectivo.
  const orderTip = 0
  const chargeTotal = order?.total_amount || 0

  const finalizeSale = async (payments: PaymentRecord[]) => {
    if (!order) return
    try {
      // Las propinas dejadas del vuelto se suman a la propina recalculada del pedido
      const tipsFromPayments = payments.reduce((s, p) => s + (p.tip || 0), 0)
      const { error } = await supabase
        .from("orders")
        .update({
          status: "completed",
          payments,
          total_amount: Number(chargeTotal.toFixed(2)),
          tip_amount: Number((orderTip + tipsFromPayments).toFixed(2)),
        })
        .eq("id", order.id)
      if (error) throw error
      // Sin toast: la animación verde de venta completada ya lo confirma
      onFinalized(order.id)
      onOpenChange(false)
    } catch (error) {
      console.error("Error finalizing sale:", error)
      toast.error("No se pudo finalizar la venta")
    }
  }

  // Los pagos parciales del dividido se persisten al toque (no se pierde plata cobrada)
  const savePartialPayments = async (payments: PaymentRecord[]) => {
    if (!order) return
    await supabase.from("orders").update({ payments }).eq("id", order.id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full max-h-[92vh] overflow-hidden flex flex-col rounded-2xl p-4 sm:p-6 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-full max-sm:rounded-t-3xl max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:max-h-[93dvh] max-sm:data-[state=open]:slide-in-from-bottom-10 max-sm:data-[state=closed]:slide-out-to-bottom-10">
        <SheetGrabBar onDismiss={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-600" />
            Cobrar {formatCurrency(chargeTotal)}
          </DialogTitle>
        </DialogHeader>
        {open && order && (
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
            {orderTip > 0 && (
              <div className="mb-4 rounded-2xl border border-border bg-muted/30 p-3 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(order.total_amount)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Propina sugerida {tipPercent}%</span><span>+{formatCurrency(orderTip)}</span></div>
                <div className="mt-1 flex justify-between border-t border-border pt-1 font-bold"><span>Total a cobrar</span><span>{formatCurrency(chargeTotal)}</span></div>
              </div>
            )}
            <OrderCheckoutPanel
              key={order.id}
              total={chargeTotal}
              items={order.items}
              initialPayments={order.payments}
              onFinalize={finalizeSale}
              onPaymentsChange={savePartialPayments}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
