"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { paymentLabel } from "@/lib/payment-methods"
import { printCashCloseTicket, type TicketWidth } from "@/lib/print-ticket"
import { cn } from "@/lib/utils"

interface Closure {
  id: string
  openedBy: string
  closedBy: string | null
  openedAt: string
  closedAt: string | null
  openingAmount: number
  closingAmount: number | null
  difference: number | null
  expectedTotals: Record<string, number> | null
  notes: string | null
}

interface Branch {
  userId: string
  branchName: string
  isAdminAccount: boolean
  salesTotal: number
  ordersCount: number
  byMethod: Record<string, number>
  tips: number
  expenses: number
  manualIncome: number
  openSession: { id: string; openedBy: string; openedAt: string; openingAmount: number } | null
  closures: Closure[]
  lowStock: { name: string; quantity: number; unit: string }[]
  stockSummary: { itemsTotal: number; lowCount: number; level: number | null }
  recentOrders: { id: string; total: number; status: string; source: string; createdAt: string; items: number }[]
}

const currencyFmt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
})

const fmtQty = (v: number) => {
  const n = Number(v) || 0
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "")
}

const shortDate = (v: string) =>
  new Date(v).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

type PanelId = "finanzas" | "caja" | "pedidos" | "stock"

const PANELS: { id: PanelId; label: string; icon: string }[] = [
  { id: "finanzas", label: "Finanzas", icon: "account_balance_wallet" },
  { id: "caja", label: "Caja", icon: "point_of_sale" },
  { id: "pedidos", label: "Pedidos", icon: "shopping_cart" },
  { id: "stock", label: "Stock", icon: "inventory_2" },
]

/** Link a la sección completa, respetando si es la cuenta propia o una sucursal */
const sectionHref = (b: Branch, path: string) =>
  b.isAdminAccount ? path : `${path}?sucursal=${b.userId}`

/**
 * Tile "Mis locales": tarjetas de cada local y, al elegir uno, el detalle se
 * abre ACÁ MISMO (finanzas, caja, pedidos, stock) sin salir del Resumen.
 * Cada panel deja igual un acceso a la sección completa por si se necesita operar.
 */
export function StoresTile({
  ownerId,
  selectedAccount,
  businessName,
}: {
  ownerId: string
  selectedAccount: string
  businessName: string
}) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [openBranch, setOpenBranch] = useState<string | null>(null)
  const [panel, setPanel] = useState<PanelId>("finanzas")
  const supabase = createClient()

  const load = useCallback(async () => {
    try {
      const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const res = await fetch(`/api/negocio/resumen?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date().toISOString())}`)
      if (!res.ok) {
        setBranches([])
        return
      }
      const j = await res.json()
      setBranches(j.branches || [])
    } catch {
      setBranches([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Realtime: ventas, cajas y stock refrescan el tile al toque
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-stores-tile")
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_sessions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, load])

  const visible = useMemo(
    () => (selectedAccount === "all" ? branches : branches.filter((b) => b.userId === selectedAccount)),
    [branches, selectedAccount]
  )

  // Si queda una sola sucursal visible, se abre sola (no tiene sentido elegir)
  useEffect(() => {
    if (visible.length === 1) setOpenBranch(visible[0].userId)
  }, [visible])

  const active = visible.find((b) => b.userId === openBranch) || null

  const reprint = (c: Closure, branchName: string) => {
    const totalsByMethod = Object.entries(c.expectedTotals || {})
      .filter(([k]) => !k.startsWith("_"))
      .map(([method, amount]) => ({ label: paymentLabel(method), amount: Number(amount) || 0 }))
    printCashCloseTicket(
      {
        businessName: `${businessName}${branchName ? ` — ${branchName}` : ""}`,
        sessionId: c.id,
        openedBy: c.openedBy,
        closedBy: c.closedBy || undefined,
        openedAt: c.openedAt,
        closedAt: c.closedAt || undefined,
        openingAmount: c.openingAmount,
        totalsByMethod,
        salesCount: 0,
        expectedCash: Number(c.expectedTotals?._expected_cash) || 0,
        countedCash: c.closingAmount ?? undefined,
        difference: c.difference ?? undefined,
        notes: c.notes || undefined,
      },
      80 as TicketWidth
    )
  }

  if (loading || branches.length === 0) return null

  return (
    <section className="sm:col-span-2 lg:col-span-4 executive-card overflow-hidden">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-lg font-bold">Mis locales</h3>
        <span className="material-symbols-outlined text-[#D1F366]">storefront</span>
      </div>
      <p className="mb-4 text-[11px] text-[#64748B]">
        Elegí un local y mirá sus finanzas, su caja, sus pedidos y su stock sin salir de acá.
      </p>

      {/* Tarjetas de locales */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((b) => {
          const isOpen = openBranch === b.userId
          return (
            <button
              key={b.userId}
              type="button"
              onClick={() => setOpenBranch(isOpen ? null : b.userId)}
              className={cn(
                "rounded-2xl border p-3 text-left transition-all",
                isOpen
                  ? "border-[#D1F366] bg-[#D1F366]/[0.08] shadow-sm"
                  : "border-border/60 hover:border-border hover:bg-muted/40"
              )}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{b.branchName}</p>
                  <p className="text-[11px] text-[#64748B]">
                    {b.ordersCount} venta{b.ordersCount === 1 ? "" : "s"} este mes
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                    b.openSession ? "bg-emerald-500/15 text-emerald-600" : "bg-black/[0.06] text-[#64748B] dark:bg-white/10"
                  )}
                >
                  {b.openSession ? "Caja abierta" : "Caja cerrada"}
                </span>
              </div>

              <p className="text-xl font-black">{currencyFmt.format(b.salesTotal)}</p>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {b.stockSummary?.lowCount > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                    {b.stockSummary.lowCount} por reponer
                  </span>
                )}
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
                  {isOpen ? "▲ Ocultar" : "▼ Ver detalle"}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Detalle embebido del local elegido */}
      {active && (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">{active.branchName}</p>
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 hide-scrollbar-mobile">
              {PANELS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPanel(p.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    panel === p.id
                      ? "bg-[#1f2030] text-[#d8ff55]"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <span className="material-symbols-outlined text-[15px]">{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── FINANZAS ── */}
          {panel === "finanzas" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {[
                  { label: "Ventas del mes", value: currencyFmt.format(active.salesTotal) },
                  { label: "Ticket promedio", value: currencyFmt.format(active.ordersCount ? active.salesTotal / active.ordersCount : 0) },
                  { label: "Propinas", value: currencyFmt.format(active.tips) },
                  { label: "Gastos", value: currencyFmt.format(active.expenses) },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl bg-background p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-[#64748B]">{k.label}</p>
                    <p className="text-base font-black leading-tight">{k.value}</p>
                  </div>
                ))}
              </div>

              {Object.keys(active.byMethod).length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-[#64748B]">Cobrado por medio de pago</p>
                  <div className="space-y-1.5">
                    {Object.entries(active.byMethod)
                      .sort((a, b) => b[1] - a[1])
                      .map(([method, amount]) => {
                        const pct = active.salesTotal ? Math.round((amount / active.salesTotal) * 100) : 0
                        return (
                          <div key={method} className="flex items-center gap-2">
                            <span className="w-24 shrink-0 truncate text-xs">{paymentLabel(method)}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                              <div className="h-full rounded-full bg-[#D1F366]" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-24 shrink-0 text-right text-xs font-bold">{currencyFmt.format(amount)}</span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              <Link href={sectionHref(active, "/dashboard/finanzas")} className="inline-block text-[11px] font-bold uppercase tracking-wide text-gray-400 hover:text-[#D1F366]">
                Abrir finanzas completas →
              </Link>
            </div>
          )}

          {/* ── CAJA ── */}
          {panel === "caja" && (
            <div className="space-y-3">
              <div className="rounded-xl bg-background p-3">
                {active.openSession ? (
                  <p className="text-sm">
                    <span className="font-semibold text-emerald-600">Caja abierta</span> por{" "}
                    <span className="font-semibold">{active.openSession.openedBy}</span> desde{" "}
                    {shortDate(active.openSession.openedAt)} · inicial {currencyFmt.format(active.openSession.openingAmount)}
                  </p>
                ) : (
                  <p className="text-sm text-[#64748B]">La caja está cerrada.</p>
                )}
              </div>

              <Link href={sectionHref(active, "/dashboard/punto-de-venta")} className="inline-block text-[11px] font-bold uppercase tracking-wide text-gray-400 hover:text-[#D1F366]">
                Abrir el punto de venta de este local →
              </Link>

              {active.closures.length === 0 ? (
                <p className="text-xs text-[#64748B]">Sin cierres en el período.</p>
              ) : (
                <div className="space-y-1.5">
                  {active.closures.slice(0, 5).map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background p-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{c.closedBy || c.openedBy}</p>
                        <p className="text-[11px] text-[#64748B]">
                          {c.closedAt ? shortDate(c.closedAt) : "—"} · cierre {currencyFmt.format(c.closingAmount || 0)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {c.difference != null && Math.abs(c.difference) > 0.01 && (
                          <span className={cn("text-xs font-bold", c.difference < 0 ? "text-red-500" : "text-emerald-600")}>
                            {c.difference > 0 ? "+" : ""}
                            {currencyFmt.format(c.difference)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => reprint(c, active.branchName)}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-muted"
                        >
                          <span className="material-symbols-outlined text-[14px]">print</span>
                          Ticket
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── PEDIDOS ── */}
          {panel === "pedidos" && (
            <div className="space-y-3">
              {active.recentOrders.length === 0 ? (
                <p className="text-xs text-[#64748B]">Todavía no hay pedidos en el período.</p>
              ) : (
                <div className="space-y-1.5">
                  {active.recentOrders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between gap-2 rounded-xl bg-background p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          #{o.id.slice(0, 6).toUpperCase()}
                          <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {o.source === "bot" ? "Bot" : "Punto de venta"}
                          </span>
                        </p>
                        <p className="text-[11px] text-[#64748B]">
                          {shortDate(o.createdAt)} · {o.items} producto{o.items === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-black">{currencyFmt.format(o.total)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <Link href={sectionHref(active, "/dashboard/pedidos")} className="text-[11px] font-bold uppercase tracking-wide text-gray-400 hover:text-[#D1F366]">
                  Abrir todos los pedidos →
                </Link>
                <Link href={sectionHref(active, "/dashboard/punto-de-venta")} className="text-[11px] font-bold uppercase tracking-wide text-gray-400 hover:text-[#D1F366]">
                  Ir al punto de venta →
                </Link>
              </div>
            </div>
          )}

          {/* ── STOCK ── */}
          {panel === "stock" && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Controlados", value: String(active.stockSummary?.itemsTotal ?? 0) },
                  { label: "Por reponer", value: String(active.stockSummary?.lowCount ?? 0) },
                  { label: "Nivel", value: active.stockSummary?.level != null ? `${active.stockSummary.level}%` : "—" },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl bg-background p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-[#64748B]">{k.label}</p>
                    <p className="text-base font-black leading-tight">{k.value}</p>
                  </div>
                ))}
              </div>

              {active.lowStock.length === 0 ? (
                <p className="text-xs text-[#64748B]">Todo por encima del mínimo.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {active.lowStock.map((i) => (
                    <span key={i.name} className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                      {i.name}: {i.quantity <= 0 ? "sin stock" : `${fmtQty(i.quantity)} ${i.unit}`}
                    </span>
                  ))}
                </div>
              )}

              <Link href={sectionHref(active, "/dashboard/stock")} className="inline-block text-[11px] font-bold uppercase tracking-wide text-gray-400 hover:text-[#D1F366]">
                Abrir stock completo →
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
