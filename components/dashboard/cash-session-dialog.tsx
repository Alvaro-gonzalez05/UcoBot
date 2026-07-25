"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Printer, History, Wallet, ChevronLeft, Ban } from "lucide-react"
import { toast } from "sonner"
import { paymentLabel } from "@/lib/payment-methods"
import {
  printCashCloseTicket,
  type CashCloseTicketData,
  type TicketWidth,
} from "@/lib/print-ticket"

export interface CashSession {
  id: string
  previous_session_id: string | null
  opened_by: string
  opened_at: string
  opening_amount: number
  closed_at: string | null
  closed_by: string | null
  status: "open" | "closed"
  expected_totals: Record<string, number> | null
  counted_totals: Record<string, number> | null
  difference: number | null
  closing_amount: number | null
  notes: string | null
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(value)

// Totales del turno calculados desde orders.payments (excluye cancelados)
interface CancelledOrder {
  id: string
  total: number
  source: string
  created_at: string
  items: any[]
}
interface SessionTotals {
  byMethod: Record<string, number>
  tips: number
  salesCount: number
  cancelledCount: number
  cancelled: CancelledOrder[]
}

async function loadSessionTotals(
  supabase: ReturnType<typeof createClient>,
  session: Pick<CashSession, "id" | "opened_at" | "closed_at">,
  userId: string
): Promise<SessionTotals> {
  const { data: rows, error } = await supabase
    .from("orders")
    .select("status, payments, tip_amount")
    .eq("cash_session_id", session.id)
  if (error) throw error

  // Cancelados del turno POR VENTANA HORARIA: incluye pedidos del bot cancelados
  // durante el turno, que nunca llegan a tener cash_session_id (se cancelan sin cobrar).
  // Los traemos con detalle para listarlos en el cierre, no solo contarlos.
  let cancelledQuery = supabase
    .from("orders")
    .select("id, total_amount, source, created_at, items")
    .eq("user_id", userId)
    .eq("status", "cancelled")
    .gte("created_at", session.opened_at)
    .order("created_at", { ascending: false })
  if (session.closed_at) cancelledQuery = cancelledQuery.lte("created_at", session.closed_at)
  const { data: cancelledRows } = await cancelledQuery
  const cancelled: CancelledOrder[] = (cancelledRows || []).map((o: any) => ({
    id: o.id,
    total: Number(o.total_amount) || 0,
    source: o.source || "pos",
    created_at: o.created_at,
    items: Array.isArray(o.items) ? o.items : [],
  }))

  const totals: SessionTotals = { byMethod: {}, tips: 0, salesCount: 0, cancelledCount: cancelled.length, cancelled }
  for (const row of rows || []) {
    if (row.status === "cancelled") {
      continue
    }
    const payments = Array.isArray(row.payments) ? row.payments : []
    if (payments.length === 0) continue
    totals.salesCount += 1

    // Propina del pedido SIN duplicar: al cobrar, el vuelto dejado de propina se
    // guarda en el pago (p.tip) Y también se acumula en tip_amount. Sumar los dos
    // contaba la propina dos veces. Tomamos el mayor: cubre los pedidos donde solo
    // está en tip_amount (POS con propina configurada) y los que solo tienen p.tip.
    const tipFromPayments = payments.reduce((s: number, p: any) => s + (Number(p?.tip) || 0), 0)
    totals.tips += Math.max(Number(row.tip_amount) || 0, tipFromPayments)

    for (const p of payments) {
      const method = p?.method || "other"
      totals.byMethod[method] = (totals.byMethod[method] || 0) + (Number(p?.amount) || 0)
      // (la propina ya se contabilizó arriba, sin duplicar)
    }
  }
  return totals
}

function buildCloseTicket(
  businessName: string,
  session: CashSession,
  totals: SessionTotals,
  countedCash: number | undefined,
  closedBy?: string
): CashCloseTicketData {
  const expectedCash = Number(session.opening_amount) + (totals.byMethod.cash || 0)
  return {
    businessName,
    sessionId: session.id,
    openedBy: session.opened_by,
    closedBy: closedBy ?? session.closed_by ?? undefined,
    openedAt: session.opened_at,
    closedAt: session.closed_at ?? new Date(),
    openingAmount: Number(session.opening_amount),
    totalsByMethod: Object.entries(totals.byMethod).map(([method, amount]) => ({
      label: paymentLabel(method),
      amount,
    })),
    tipsTotal: totals.tips > 0 ? totals.tips : undefined,
    salesCount: totals.salesCount,
    cancelledCount: totals.cancelledCount || undefined,
    expectedCash,
    countedCash,
    difference: typeof countedCash === "number" ? countedCash - expectedCash : undefined,
    notes: session.notes ?? undefined,
  }
}

/**
 * Diálogo de caja del punto de venta: apertura (con monto inicial sugerido desde
 * el cierre anterior), cierre con arqueo por método de pago + ticket de cierre,
 * e historial de cajas cerradas con reimpresión.
 */
export function CashSessionDialog({
  open,
  onOpenChange,
  userId,
  businessName,
  ticketWidth,
  activeSession,
  onSessionChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  businessName: string
  ticketWidth: TicketWidth
  activeSession: CashSession | null
  onSessionChange: (session: CashSession | null) => void
}) {
  const supabase = createClient()
  const [view, setView] = useState<"main" | "history">("main")
  const [saving, setSaving] = useState(false)

  // Apertura
  const [openedBy, setOpenedBy] = useState("")
  const [openingAmount, setOpeningAmount] = useState("")
  const [lastClosed, setLastClosed] = useState<CashSession | null>(null)

  // Cierre
  const [totals, setTotals] = useState<SessionTotals | null>(null)
  const [countedCash, setCountedCash] = useState("")
  const [closeNotes, setCloseNotes] = useState("")

  // Historial
  const [history, setHistory] = useState<CashSession[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Al abrir: si no hay caja, precargar responsable + monto sugerido; si hay, calcular totales del turno
  useEffect(() => {
    if (!open) return
    setView("main")
    if (!activeSession) {
      supabase
        .from("cash_sessions")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          const prev = (data as CashSession) || null
          setLastClosed(prev)
          setOpeningAmount(prev?.closing_amount != null ? String(prev.closing_amount) : "0")
        })
      supabase.auth.getUser().then(async ({ data }) => {
        const authId = data.user?.id
        if (!authId) return
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("full_name")
          .eq("id", authId)
          .maybeSingle()
        // Solo el nombre de la persona: el nombre del negocio queda enorme en el
        // ticket ("Responsable: EL Sitio Restobar y Staff Catering") y no dice quién es.
        setOpenedBy((prev) => prev || profile?.full_name || "")
      })
    } else {
      setTotals(null)
      loadSessionTotals(supabase, activeSession, userId)
        .then(setTotals)
        .catch(() => toast.error("No se pudieron calcular los totales del turno"))
    }
  }, [open, activeSession?.id, userId])

  const expectedCash = useMemo(() => {
    if (!activeSession || !totals) return 0
    return Number(activeSession.opening_amount) + (totals.byMethod.cash || 0)
  }, [activeSession, totals])

  const countedNum = Number(countedCash.replace(",", ".")) || 0
  const difference = countedCash.trim() === "" ? null : countedNum - expectedCash

  const handleOpenSession = async () => {
    if (!openedBy.trim()) {
      toast.error("Ingresá el nombre del responsable de la caja")
      return
    }
    const amount = Number(openingAmount.replace(",", ".")) || 0
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from("cash_sessions")
        .insert({
          user_id: userId,
          previous_session_id: lastClosed?.id ?? null,
          opened_by: openedBy.trim(),
          opening_amount: Number(amount.toFixed(2)),
        })
        .select("*")
        .single()
      if (error) throw error
      onSessionChange(data as CashSession)
      toast.success(`Caja abierta a nombre de ${openedBy.trim()}`)
      onOpenChange(false)
    } catch (err: any) {
      // Índice único: ya hay una caja abierta (ej: otro empleado la abrió recién)
      if (err?.code === "23505") {
        toast.error("Ya hay una caja abierta en esta cuenta")
      } else {
        console.error("Error opening cash session:", err)
        toast.error("No se pudo abrir la caja")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCloseSession = async () => {
    if (!activeSession || !totals) return
    if (countedCash.trim() === "") {
      toast.error("Ingresá el efectivo contado para el arqueo")
      return
    }
    setSaving(true)
    try {
      const diff = countedNum - expectedCash
      const closedAt = new Date().toISOString()
      const { data, error } = await supabase
        .from("cash_sessions")
        .update({
          status: "closed",
          closed_at: closedAt,
          closed_by: openedBy.trim() || activeSession.opened_by,
          expected_totals: { ...totals.byMethod, _expected_cash: Number(expectedCash.toFixed(2)) },
          counted_totals: { cash: Number(countedNum.toFixed(2)) },
          difference: Number(diff.toFixed(2)),
          closing_amount: Number(countedNum.toFixed(2)),
          notes: closeNotes.trim() || null,
        })
        .eq("id", activeSession.id)
        .select("*")
        .single()
      if (error) throw error

      const closed = data as CashSession
      onSessionChange(null)
      printCashCloseTicket(buildCloseTicket(businessName, closed, totals, countedNum), ticketWidth)
      toast.success("Caja cerrada. Se generó el ticket de cierre.")
      setCountedCash("")
      setCloseNotes("")
      onOpenChange(false)
    } catch (err) {
      console.error("Error closing cash session:", err)
      toast.error("No se pudo cerrar la caja")
    } finally {
      setSaving(false)
    }
  }

  const loadHistory = async () => {
    setView("history")
    setHistoryLoading(true)
    try {
      const { data, error } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(30)
      if (error) throw error
      setHistory((data as CashSession[]) || [])
    } catch {
      toast.error("No se pudo cargar el historial de cajas")
    } finally {
      setHistoryLoading(false)
    }
  }

  const reprintSession = async (session: CashSession) => {
    try {
      const sessionTotals = await loadSessionTotals(supabase, session, userId)
      printCashCloseTicket(
        buildCloseTicket(businessName, session, sessionTotals, session.counted_totals?.cash),
        ticketWidth
      )
    } catch {
      toast.error("No se pudo reimprimir el cierre")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {view === "history" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <button type="button" onClick={() => setView("main")} className="rounded-full p-1 hover:bg-muted">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                Historial de cajas
              </DialogTitle>
              <DialogDescription>Cierres anteriores, con su responsable y diferencia de arqueo.</DialogDescription>
            </DialogHeader>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {historyLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : history.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay cajas cerradas.</p>
              ) : (
                history.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {new Date(s.closed_at || s.opened_at).toLocaleDateString("es-AR")} · {s.closed_by || s.opened_by}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Cierre: {formatCurrency(Number(s.closing_amount) || 0)}
                        {s.difference != null && Number(s.difference) !== 0 && (
                          <span className={Number(s.difference) < 0 ? " text-red-500" : " text-emerald-600"}>
                            {" "}· Dif: {Number(s.difference) > 0 ? "+" : ""}{formatCurrency(Number(s.difference))}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => reprintSession(s)}>
                      <Printer className="mr-1 h-3.5 w-3.5" /> Ticket
                    </Button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : activeSession ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" /> Cerrar caja
              </DialogTitle>
              <DialogDescription>
                Abierta por {activeSession.opened_by} el {new Date(activeSession.opened_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
              </DialogDescription>
            </DialogHeader>
            {!totals ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border p-3 text-sm">
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted-foreground">Monto inicial</span>
                    <span>{formatCurrency(Number(activeSession.opening_amount))}</span>
                  </div>
                  {Object.entries(totals.byMethod).map(([method, amount]) => (
                    <div key={method} className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">{paymentLabel(method)}</span>
                      <span>{formatCurrency(amount)}</span>
                    </div>
                  ))}
                  {totals.tips > 0 && (
                    <div className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">Propinas</span>
                      <span>{formatCurrency(totals.tips)}</span>
                    </div>
                  )}
                  <div className="mt-1 flex justify-between border-t pt-1.5 font-medium">
                    <span>Efectivo esperado</span>
                    <span>{formatCurrency(expectedCash)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {totals.salesCount} venta{totals.salesCount === 1 ? "" : "s"}
                    {totals.cancelledCount > 0 ? ` · ${totals.cancelledCount} cancelada${totals.cancelledCount === 1 ? "" : "s"}` : ""}
                  </p>
                </div>

                {/* Detalle de cancelados del turno (bot + POS) */}
                {totals.cancelled.length > 0 && (
                  <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-900/10 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400">
                      <Ban className="h-3.5 w-3.5" /> Cancelados del turno ({totals.cancelled.length})
                    </p>
                    <div className="max-h-40 space-y-1.5 overflow-y-auto">
                      {totals.cancelled.map((o) => {
                        const first = o.items?.[0]?.name || o.items?.[0]?.product_name || "Pedido"
                        const more = (o.items?.length || 0) > 1 ? ` +${o.items.length - 1}` : ""
                        return (
                          <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                            <div className="min-w-0 truncate">
                              <span className="font-medium">{first}{more}</span>
                              <span className="ml-1.5 text-muted-foreground">
                                {o.source === "bot" ? "Bot" : "POS"} · {new Date(o.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <span className="flex-shrink-0 text-muted-foreground line-through">{formatCurrency(o.total)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="counted-cash">Efectivo contado (arqueo)</Label>
                  <Input
                    id="counted-cash"
                    inputMode="decimal"
                    placeholder="0"
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                  />
                  {difference != null && (
                    <p className={`text-xs ${Math.abs(difference) < 0.01 ? "text-emerald-600" : "text-red-500"}`}>
                      {Math.abs(difference) < 0.01
                        ? "Arqueo perfecto: sin diferencia"
                        : `Diferencia: ${difference > 0 ? "+" : ""}${formatCurrency(difference)}`}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="close-notes">Nota (opcional)</Label>
                  <Input
                    id="close-notes"
                    placeholder="Ej: faltante por vuelto mal dado"
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={loadHistory}>
                    <History className="mr-1.5 h-4 w-4" /> Historial
                  </Button>
                  <Button className="flex-1" onClick={handleCloseSession} disabled={saving}>
                    {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />}
                    Cerrar e imprimir
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" /> Abrir caja
              </DialogTitle>
              <DialogDescription>
                Las ventas del turno quedan asociadas a esta caja hasta que la cierres.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="opened-by">Responsable</Label>
                <Input
                  id="opened-by"
                  placeholder="Nombre de quien abre la caja"
                  value={openedBy}
                  onChange={(e) => setOpenedBy(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opening-amount">Efectivo inicial</Label>
                <Input
                  id="opening-amount"
                  inputMode="decimal"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                />
                {lastClosed?.closing_amount != null && (
                  <p className="text-xs text-muted-foreground">
                    Sugerido: {formatCurrency(Number(lastClosed.closing_amount))} (cierre del{" "}
                    {new Date(lastClosed.closed_at || lastClosed.opened_at).toLocaleDateString("es-AR")})
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={loadHistory}>
                  <History className="mr-1.5 h-4 w-4" /> Historial
                </Button>
                <Button className="flex-1" onClick={handleOpenSession} disabled={saving}>
                  {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Abrir caja
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
