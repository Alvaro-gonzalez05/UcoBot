"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts"
import { Loader2, Plus, Pencil, Trash2, Bot, Store, PenLine, ArrowUp, ArrowDown, BarChart3, ShoppingCart } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface FinanzasViewProps {
  userId: string
}

interface FinancialTransaction {
  id: string
  type: "income" | "expense"
  category: string
  description: string | null
  amount: number
  transaction_date: string
  payment_method: string | null
}

interface OrderRow {
  id: string
  total_amount: number
  source: "bot" | "pos"
  status: string
  created_at: string
}

// Una fila del feed de movimientos (viene de la RPC finance_movements)
interface Movement {
  key: string
  kind: "sale" | "manual"
  type: "income" | "expense"
  title: string
  subtitle: string
  meta: string
  amount: number
  date: string
  refId: string
}

interface Totals {
  ventasBot: number
  ventasPos: number
  ingresosManuales: number
  gastos: number
  cantVentas: number
}

const emptyTotals: Totals = {
  ventasBot: 0,
  ventasPos: 0,
  ingresosManuales: 0,
  gastos: 0,
  cantVentas: 0,
}

// Detalle de una venta (para el sheet)
interface SaleDetail {
  id: string
  total_amount: number
  status: string
  source: "bot" | "pos"
  created_at: string
  items: any[]
  customer_notes: string | null
  delivery_phone: string | null
  client?: { name?: string } | null
}

// Cuántos movimientos trae cada tanda del scroll infinito
const MOVS_PAGE = 10

type Period = "this_month" | "last_month" | "last_3_months" | "this_year"

const periodLabels: Record<Period, string> = {
  this_month: "Este mes",
  last_month: "Mes pasado",
  last_3_months: "Últimos 3 meses",
  this_year: "Este año",
}

const expenseCategories = [
  { id: "alquiler", label: "Alquiler" },
  { id: "sueldos", label: "Sueldos" },
  { id: "mercaderia", label: "Mercadería / Insumos" },
  { id: "servicios", label: "Servicios" },
  { id: "impuestos", label: "Impuestos" },
  { id: "marketing", label: "Marketing" },
  { id: "otros", label: "Otros" },
]

const incomeCategories = [
  { id: "venta_externa", label: "Venta externa" },
  { id: "inversion", label: "Inversión / Aporte" },
  { id: "otros", label: "Otros" },
]

const paymentMethods = [
  { id: "cash", label: "Efectivo" },
  { id: "transfer", label: "Transferencia" },
  { id: "card", label: "Tarjeta" },
  { id: "mercadopago", label: "Mercado Pago" },
  { id: "other", label: "Otro" },
]

function categoryLabel(type: "income" | "expense", id: string) {
  const list = type === "expense" ? expenseCategories : incomeCategories
  return list.find((c) => c.id === id)?.label || id
}

const currencyFmt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
})

function formatMoney(value: number) {
  return currencyFmt.format(value)
}

function getPeriodRange(period: Period): { from: Date; to: Date } {
  const now = new Date()
  switch (period) {
    case "this_month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
    case "last_month":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
      }
    case "last_3_months":
      return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to: now }
    case "this_year":
      return { from: new Date(now.getFullYear(), 0, 1), to: now }
  }
}

function toDateInput(date: Date) {
  return date.toISOString().split("T")[0]
}

const emptyForm = {
  type: "expense" as "income" | "expense",
  category: "otros",
  description: "",
  amount: "",
  transaction_date: toDateInput(new Date()),
  payment_method: "cash",
}

export function FinanzasView({ userId }: FinanzasViewProps) {
  const supabase = createClient()
  const router = useRouter()

  const [period, setPeriod] = useState<Period>("this_month")
  const [loading, setLoading] = useState(true)
  const [chartOrders, setChartOrders] = useState<OrderRow[]>([])
  const [chartTransactions, setChartTransactions] = useState<FinancialTransaction[]>([])

  // Totales del período (salen de un SUM en la base, no de traer todas las filas)
  const [totals, setTotals] = useState<Totals>({ ...emptyTotals })

  // Feed de movimientos paginado (10 por tanda, scroll infinito)
  const [movements, setMovements] = useState<Movement[]>([])
  const [movsLoading, setMovsLoading] = useState(false)
  const [movsHasMore, setMovsHasMore] = useState(true)

  // Form dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Carrusel de tarjetas (mobile): se desliza entre Total ganado / Gastos / Ganancia neta
  const heroRef = useRef<HTMLDivElement>(null)
  const [heroIdx, setHeroIdx] = useState(0)
  const [showChart, setShowChart] = useState(false)

  // Detalle de una venta (sheet)
  const [saleId, setSaleId] = useState<string | null>(null)
  const [saleDetail, setSaleDetail] = useState<SaleDetail | null>(null)
  const [saleLoading, setSaleLoading] = useState(false)

  // ── Totales del período ─────────────────────────────────────────────────
  const fetchTotals = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = getPeriodRange(period)
      const { data, error } = await supabase.rpc("finance_totals", {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      })
      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as any
      setTotals({
        ventasBot: Number(row?.ventas_bot || 0),
        ventasPos: Number(row?.ventas_pos || 0),
        ingresosManuales: Number(row?.ingresos_manuales || 0),
        gastos: Number(row?.gastos || 0),
        cantVentas: Number(row?.cant_ventas || 0),
      })
    } catch (err) {
      console.error("Error fetching finance totals:", err)
      toast.error("No se pudieron cargar los totales")
    } finally {
      setLoading(false)
    }
  }, [period, supabase])

  // ── Movimientos: primera tanda / siguientes (scroll infinito) ───────────
  const fetchMovements = useCallback(
    async (offset: number) => {
      const { from, to } = getPeriodRange(period)
      const { data, error } = await supabase.rpc("finance_movements", {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
        p_limit: MOVS_PAGE,
        p_offset: offset,
      })
      if (error) throw error
      const rows = ((data as any[]) || []).map((r) => ({
        key: String(r.key),
        kind: r.kind as "sale" | "manual",
        type: r.type as "income" | "expense",
        title: r.kind === "manual" ? categoryLabel(r.type, r.title) : String(r.title),
        subtitle: String(r.subtitle || ""),
        meta: r.kind === "manual"
          ? paymentMethods.find((p) => p.id === r.meta)?.label || ""
          : String(r.meta || ""),
        amount: Number(r.amount || 0),
        date: String(r.occurred_at),
        refId: String(r.ref_id),
      })) as Movement[]
      return rows
    },
    [period, supabase]
  )

  const reloadMovements = useCallback(async () => {
    setMovsLoading(true)
    try {
      const rows = await fetchMovements(0)
      setMovements(rows)
      setMovsHasMore(rows.length === MOVS_PAGE)
    } catch (err) {
      console.error("Error fetching movements:", err)
    } finally {
      setMovsLoading(false)
    }
  }, [fetchMovements])

  const loadMoreMovements = useCallback(async () => {
    if (movsLoading || !movsHasMore) return
    setMovsLoading(true)
    try {
      const rows = await fetchMovements(movements.length)
      setMovements((prev) => {
        const seen = new Set(prev.map((m) => m.key))
        return [...prev, ...rows.filter((r) => !seen.has(r.key))]
      })
      setMovsHasMore(rows.length === MOVS_PAGE)
    } catch (err) {
      console.error("Error loading more movements:", err)
    } finally {
      setMovsLoading(false)
    }
  }, [fetchMovements, movements.length, movsHasMore, movsLoading])

  // Al cambiar el período: totales + primera tanda de movimientos
  useEffect(() => {
    fetchTotals()
    setMovements([])
    setMovsHasMore(true)
    reloadMovements()
  }, [fetchTotals, reloadMovements])

  // Refresca todo (después de crear/editar/borrar un movimiento)
  const refreshAll = useCallback(() => {
    fetchTotals()
    reloadMovements()
    setChartLoaded(false)
  }, [fetchTotals, reloadMovements])

  // Observer del scroll infinito
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef(loadMoreMovements)
  loadMoreRef.current = loadMoreMovements
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreRef.current() },
      { rootMargin: "200px" }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [movsHasMore])

  // ── Gráfico: se carga recién cuando lo abrís (no pesa en la carga inicial) ──
  const [chartLoaded, setChartLoaded] = useState(false)
  useEffect(() => {
    if (!showChart || chartLoaded) return
    const load = async () => {
      try {
        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
        sixMonthsAgo.setDate(1)
        sixMonthsAgo.setHours(0, 0, 0, 0)
        const [chartOrdersRes, chartTxRes] = await Promise.all([
          supabase
            .from("orders")
            .select("id, total_amount, source, status, created_at")
            .eq("user_id", userId)
            .neq("status", "cancelled")
            .gte("created_at", sixMonthsAgo.toISOString()),
          supabase
            .from("financial_transactions")
            .select("id, type, category, description, amount, transaction_date, payment_method")
            .eq("user_id", userId)
            .gte("transaction_date", toDateInput(sixMonthsAgo)),
        ])
        setChartOrders((chartOrdersRes.data as OrderRow[]) || [])
        setChartTransactions((chartTxRes.data as FinancialTransaction[]) || [])
        setChartLoaded(true)
      } catch (err) {
        console.error("Error loading chart data:", err)
      }
    }
    load()
  }, [showChart, chartLoaded, supabase, userId])

  // ── Métricas del período (derivadas de los totales) ──────────────────────
  const stats = useMemo(() => {
    const ingresosTotales = totals.ventasBot + totals.ventasPos + totals.ingresosManuales
    const ganancia = ingresosTotales - totals.gastos
    const margen = ingresosTotales > 0 ? (ganancia / ingresosTotales) * 100 : 0
    return { ...totals, ingresosTotales, ganancia, margen }
  }, [totals])

  // ── Datos del gráfico: ingresos vs gastos últimos 6 meses ───────────────
  const chartData = useMemo(() => {
    const months: { key: string; label: string; Ingresos: number; Gastos: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      months.push({
        key,
        label: d.toLocaleDateString("es-AR", { month: "short" }).replace(".", ""),
        Ingresos: 0,
        Gastos: 0,
      })
    }
    const byKey = Object.fromEntries(months.map((m) => [m.key, m]))

    for (const o of chartOrders) {
      const d = new Date(o.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      if (byKey[key]) byKey[key].Ingresos += Number(o.total_amount || 0)
    }
    for (const t of chartTransactions) {
      const key = t.transaction_date.slice(0, 7)
      if (!byKey[key]) continue
      if (t.type === "income") byKey[key].Ingresos += Number(t.amount)
      else byKey[key].Gastos += Number(t.amount)
    }
    return months
  }, [chartOrders, chartTransactions])

  // ── Alta / edición de movimientos ───────────────────────────────────────
  const openCreate = (type: "income" | "expense") => {
    setEditingId(null)
    setForm({ ...emptyForm, type, category: "otros", transaction_date: toDateInput(new Date()) })
    setDialogOpen(true)
  }

  const openEdit = (tx: FinancialTransaction) => {
    setEditingId(tx.id)
    setForm({
      type: tx.type,
      category: tx.category,
      description: tx.description || "",
      amount: String(tx.amount),
      transaction_date: tx.transaction_date,
      payment_method: tx.payment_method || "cash",
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const amount = parseFloat(form.amount.replace(",", "."))
    if (!amount || amount <= 0) {
      toast.error("Ingresá un monto válido")
      return
    }
    if (!form.transaction_date) {
      toast.error("Ingresá una fecha")
      return
    }

    setSaving(true)
    try {
      const payload = {
        user_id: userId,
        type: form.type,
        category: form.category,
        description: form.description.trim() || null,
        amount,
        transaction_date: form.transaction_date,
        payment_method: form.payment_method,
      }

      const { error } = editingId
        ? await supabase
            .from("financial_transactions")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", editingId)
        : await supabase.from("financial_transactions").insert(payload)

      if (error) throw error

      toast.success(
        editingId
          ? "Movimiento actualizado"
          : form.type === "expense"
            ? "Gasto registrado"
            : "Ingreso registrado"
      )
      setDialogOpen(false)
      refreshAll()
    } catch (err) {
      console.error("Error saving transaction:", err)
      toast.error("No se pudo guardar el movimiento")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const { error } = await supabase.from("financial_transactions").delete().eq("id", deleteId)
      if (error) throw error
      toast.success("Movimiento eliminado")
      refreshAll()
    } catch (err) {
      console.error("Error deleting transaction:", err)
      toast.error("No se pudo eliminar el movimiento")
    } finally {
      setDeleteId(null)
    }
  }

  const categories = form.type === "expense" ? expenseCategories : incomeCategories

  // ── Tarjetas del carrusel (mobile) / grilla (desktop) ───────────────────
  const nExpenses = movements.filter((t) => t.type === "expense").length
  const heroCards = [
    {
      key: "ingresos",
      label: "Total ganado",
      value: stats.ingresosTotales,
      accent: "text-[#D1F366]",
      sub: `${stats.cantVentas} venta${stats.cantVentas === 1 ? "" : "s"} + ingresos manuales`,
    },
    {
      key: "gastos",
      label: "Gastos",
      value: stats.gastos,
      accent: "text-rose-400",
      sub: `${nExpenses} gasto${nExpenses === 1 ? "" : "s"} registrado${nExpenses === 1 ? "" : "s"}`,
    },
    {
      key: "neta",
      label: "Ganancia neta",
      value: stats.ganancia,
      accent: stats.ganancia < 0 ? "text-rose-400" : "text-[#D1F366]",
      sub: `Margen del ${stats.margen.toFixed(1)}% sobre ingresos`,
    },
  ]

  // El índice activo sale del scroll real (así funciona el swipe nativo del celu)
  const onHeroScroll = () => {
    const el = heroRef.current
    if (!el || el.clientWidth === 0) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    setHeroIdx(Math.max(0, Math.min(heroCards.length - 1, i)))
  }
  const goHero = (i: number) => {
    const el = heroRef.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" })
  }

  const movDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" })

  // Al tocar un movimiento: si es manual → editar; si es venta → abrir su detalle
  const openMovement = async (m: Movement) => {
    if (m.kind === "manual") {
      const tx = await fetchTransaction(m.refId)
      if (tx) openEdit(tx)
      return
    }
    setSaleId(m.refId)
    setSaleDetail(null)
    setSaleLoading(true)
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("id, total_amount, status, source, created_at, items, customer_notes, delivery_phone, client:client_id(name)")
        .eq("id", m.refId)
        .single()
      if (error) throw error
      setSaleDetail(data as unknown as SaleDetail)
    } catch (err) {
      console.error("Error loading sale detail:", err)
      toast.error("No se pudo cargar la venta")
    } finally {
      setSaleLoading(false)
    }
  }

  // El feed no trae la fila completa del movimiento manual: la buscamos para editar
  const fetchTransaction = async (id: string): Promise<FinancialTransaction | null> => {
    try {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("id, type, category, description, amount, transaction_date, payment_method")
        .eq("id", id)
        .single()
      if (error) throw error
      return data as FinancialTransaction
    } catch (err) {
      console.error("Error loading transaction:", err)
      toast.error("No se pudo abrir el movimiento")
      return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Finanzas</h1>
          <p className="text-sm text-muted-foreground">
            Ingresos, gastos y ganancias de tu negocio
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-full sm:w-[170px] input-field">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(periodLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ── Tarjetas: se deslizan en mobile (3 puntitos), grilla en desktop ── */}
          <section>
            <div
              ref={heroRef}
              onScroll={onHeroScroll}
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto hide-scrollbar md:grid md:grid-cols-3 md:gap-4 md:overflow-visible"
            >
              {heroCards.map((c) => (
                <div key={c.key} className="w-full shrink-0 snap-center md:w-auto">
                  <div className="rounded-3xl bg-[#1C1C28] p-6 text-center shadow-[0_16px_40px_-12px_rgba(17,24,39,0.5)] md:h-full">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">
                      {c.label}
                    </p>
                    <p className={cn("mt-2 text-4xl font-black tracking-tight sm:text-[2.75rem]", c.accent)}>
                      {formatMoney(c.value)}
                    </p>
                    <p className="mt-2 text-[11px] leading-relaxed text-white/40">{c.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Puntitos (solo mobile: en desktop se ven las 3 juntas) */}
            <div className="mt-3 flex justify-center gap-1.5 md:hidden">
              {heroCards.map((c, i) => (
                <button
                  key={c.key}
                  type="button"
                  aria-label={`Ver ${c.label}`}
                  onClick={() => goHero(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === heroIdx ? "w-6 bg-[#D1F366]" : "w-1.5 bg-muted-foreground/30"
                  )}
                />
              ))}
            </div>
          </section>

          {/* ── Acciones rápidas ── */}
          <section className="flex items-start justify-center gap-8 sm:gap-12">
            <button
              type="button"
              onClick={() => openCreate("income")}
              className="group flex flex-col items-center gap-2"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#D1F366] text-[#1C1C28] shadow-md transition-transform group-hover:scale-105 group-active:scale-90">
                <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <span className="text-xs font-semibold">Ingreso</span>
            </button>
            <button
              type="button"
              onClick={() => openCreate("expense")}
              className="group flex flex-col items-center gap-2"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-md transition-transform group-hover:scale-105 group-active:scale-90">
                <ArrowDown className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <span className="text-xs font-semibold">Gasto</span>
            </button>
            <button
              type="button"
              onClick={() => setShowChart((v) => !v)}
              className="group flex flex-col items-center gap-2"
            >
              <span className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full shadow-md transition-transform group-hover:scale-105 group-active:scale-90",
                showChart ? "bg-[#1f2030] text-[#d8ff55]" : "bg-muted text-muted-foreground"
              )}>
                <BarChart3 className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <span className="text-xs font-semibold">Gráfico</span>
            </button>
          </section>

          {/* ── Origen de las ventas (resumen compacto) ── */}
          <section className="executive-card">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Origen de las ventas
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4">
              {[
                { icon: Bot, label: "Bot", value: stats.ventasBot },
                { icon: Store, label: "Punto de venta", value: stats.ventasPos },
                { icon: PenLine, label: "Manuales", value: stats.ingresosManuales },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center justify-between gap-2 rounded-2xl bg-muted/40 px-3 py-2.5 sm:flex-col sm:items-start sm:gap-1">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </span>
                  <span className="text-sm font-bold sm:text-lg">{formatMoney(value)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Movimientos (estilo lista) ── */}
          <section className="executive-card">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">Movimientos</h2>
              <span className="text-[11px] text-muted-foreground">{periodLabels[period]}</span>
            </div>

            {movements.length === 0 && !movsLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No hay movimientos en {periodLabels[period].toLowerCase()}. Acá vas a ver tus
                ventas, y los gastos e ingresos que cargues con los botones de arriba.
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {movements.map((m) => (
                  <div
                    key={m.key}
                    onClick={() => openMovement(m)}
                    className="group flex cursor-pointer items-center gap-3 py-3"
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                        m.type === "expense"
                          ? "bg-rose-500/15 text-rose-500"
                          : "bg-[#D1F366]/20 text-[#5c7a16] dark:text-[#D1F366]"
                      )}
                    >
                      {m.type === "expense" ? (
                        <ArrowDown className="h-4 w-4" strokeWidth={2.5} />
                      ) : (
                        <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{m.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[m.subtitle, movDate(m.date)].filter(Boolean).join(" · ")}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "text-sm font-bold",
                          m.type === "expense" ? "text-rose-500" : "text-[#5c7a16] dark:text-[#D1F366]"
                        )}
                      >
                        {m.type === "expense" ? "-" : "+"}
                        {formatMoney(m.amount)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{m.meta}</p>
                    </div>

                    {/* Solo los movimientos manuales se borran desde acá; las ventas no */}
                    <div className="flex w-8 shrink-0 items-center justify-center">
                      {m.kind === "manual" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground opacity-100 transition-opacity hover:text-red-500 md:opacity-0 md:group-hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); setDeleteId(m.refId) }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sensor del scroll infinito: al asomarse, trae la próxima tanda */}
            <div ref={sentinelRef} className="flex justify-center py-4">
              {movsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : !movsHasMore && movements.length > 0 ? (
                <span className="text-[11px] text-muted-foreground">No hay más movimientos</span>
              ) : null}
            </div>
          </section>

          {/* Gráfico ingresos vs gastos (se muestra con el botón "Gráfico") */}
          <section className={cn("executive-card", !showChart && "hidden")}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold">Ingresos vs Gastos</h2>
                <p className="text-xs text-muted-foreground">Últimos 6 meses</p>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="#94A3B8"
                    tickFormatter={(v: number) =>
                      v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(value: number) => formatMoney(value)}
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.35 }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      color: "hsl(var(--foreground))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                      fontSize: "12px",
                      boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 700 }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Ingresos" fill="#D1F366" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Gastos" fill="#EF4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Los ingresos incluyen ventas del bot, del punto de venta e ingresos manuales. Se
              excluyen pedidos cancelados.
            </p>
          </section>

        </>
      )}

      {/* Dialog alta/edición */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? "Editar movimiento"
                : form.type === "expense"
                  ? "Registrar gasto"
                  : "Registrar ingreso"}
            </DialogTitle>
            <DialogDescription>
              {form.type === "expense"
                ? "Cargá un gasto del negocio para descontarlo de tus ganancias."
                : "Cargá un ingreso que no venga del bot ni del punto de venta."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(v: "income" | "expense") =>
                    setForm({ ...form, type: v, category: "otros" })
                  }
                >
                  <SelectTrigger className="input-field">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Gasto</SelectItem>
                    <SelectItem value="income">Ingreso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Monto *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger className="input-field">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha *</Label>
                <Input
                  type="date"
                  value={form.transaction_date}
                  onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Método de pago</Label>
              <Select
                value={form.payment_method}
                onValueChange={(v) => setForm({ ...form, payment_method: v })}
              >
                <SelectTrigger className="input-field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea
                placeholder="Ej: Alquiler del local de junio"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input-field min-h-[60px]"
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando…
                </>
              ) : editingId ? (
                "Guardar cambios"
              ) : (
                "Registrar"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detalle de una venta (sheet abajo en mobile, modal en desktop) */}
      <Dialog open={!!saleId} onOpenChange={(o) => { if (!o) { setSaleId(null); setSaleDetail(null) } }}>
        <DialogContent className="max-w-md w-full max-h-[92vh] overflow-hidden flex flex-col rounded-2xl p-4 sm:p-6 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-full max-sm:rounded-t-3xl max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:max-h-[93dvh] max-sm:data-[state=open]:slide-in-from-bottom-10 max-sm:data-[state=closed]:slide-out-to-bottom-10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {saleDetail?.source === "bot" ? <Bot className="h-5 w-5" /> : <Store className="h-5 w-5" />}
              {saleDetail ? (saleDetail.source === "bot" ? "Venta por el bot" : "Venta en el punto de venta") : "Venta"}
            </DialogTitle>
            <DialogDescription>
              {saleDetail
                ? `Pedido #${saleDetail.id.slice(0, 8).toUpperCase()} · ${new Date(saleDetail.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}`
                : "Cargando…"}
            </DialogDescription>
          </DialogHeader>

          {saleLoading || !saleDetail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="font-medium">
                    {saleDetail.client?.name ||
                      (saleDetail.delivery_phone && saleDetail.delivery_phone !== "venta-local"
                        ? saleDetail.delivery_phone
                        : "Cliente anónimo")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Estado</p>
                  <p className="font-medium capitalize">{saleDetail.status}</p>
                </div>
              </div>

              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Productos
              </p>
              <div className="mt-2 space-y-2">
                {Array.isArray(saleDetail.items) && saleDetail.items.length > 0 ? (
                  saleDetail.items
                    .filter((it: any) => !it?.removed)
                    .map((it: any, i: number) => (
                      <div key={i} className="flex items-start justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
                        <span className="min-w-0 text-sm">
                          {it.quantity}x {it.name || it.product_name || `Producto ${i + 1}`}
                          {Array.isArray(it.options) && it.options.length > 0 && (
                            <span className="block text-[11px] text-muted-foreground">
                              {it.options.map((o: any) => (typeof o === "string" ? o : o?.name)).filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm font-semibold">
                          {formatMoney((Number(it.price) || 0) * (Number(it.quantity) || 1))}
                        </span>
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sin detalle de productos</p>
                )}
              </div>

              {saleDetail.customer_notes && (
                <p className="mt-3 rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {saleDetail.customer_notes}
                </p>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Total</span>
                <span className="text-xl font-black">{formatMoney(Number(saleDetail.total_amount || 0))}</span>
              </div>
            </div>
          )}

          <div className="mt-3 shrink-0">
            <Button
              onClick={() => saleDetail && router.push(`/dashboard/pedidos?order=${saleDetail.id}`)}
              disabled={!saleDetail}
              className="w-full gap-2 rounded-xl bg-[#D1F366] font-bold text-[#1C1C28] hover:bg-[#B3D93C]"
            >
              <ShoppingCart className="h-4 w-4" />
              Ver el pedido
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El movimiento se eliminará de tus finanzas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
