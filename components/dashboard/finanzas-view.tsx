"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react"
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
  total_amount: number
  source: "bot" | "pos"
  status: string
  created_at: string
}

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

  const [period, setPeriod] = useState<Period>("this_month")
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [chartOrders, setChartOrders] = useState<OrderRow[]>([])
  const [chartTransactions, setChartTransactions] = useState<FinancialTransaction[]>([])

  // Form dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = getPeriodRange(period)
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
      sixMonthsAgo.setDate(1)
      sixMonthsAgo.setHours(0, 0, 0, 0)

      const [txRes, ordersRes, chartOrdersRes, chartTxRes] = await Promise.all([
        supabase
          .from("financial_transactions")
          .select("id, type, category, description, amount, transaction_date, payment_method")
          .eq("user_id", userId)
          .gte("transaction_date", toDateInput(from))
          .lte("transaction_date", toDateInput(to))
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("total_amount, source, status, created_at")
          .eq("user_id", userId)
          .neq("status", "cancelled")
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString()),
        supabase
          .from("orders")
          .select("total_amount, source, status, created_at")
          .eq("user_id", userId)
          .neq("status", "cancelled")
          .gte("created_at", sixMonthsAgo.toISOString()),
        supabase
          .from("financial_transactions")
          .select("id, type, category, description, amount, transaction_date, payment_method")
          .eq("user_id", userId)
          .gte("transaction_date", toDateInput(sixMonthsAgo)),
      ])

      setTransactions((txRes.data as FinancialTransaction[]) || [])
      setOrders((ordersRes.data as OrderRow[]) || [])
      setChartOrders((chartOrdersRes.data as OrderRow[]) || [])
      setChartTransactions((chartTxRes.data as FinancialTransaction[]) || [])
    } catch (err) {
      console.error("Error fetching finance data:", err)
      toast.error("No se pudieron cargar los datos de finanzas")
    } finally {
      setLoading(false)
    }
  }, [period, userId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Métricas del período ────────────────────────────────────────────────
  const stats = useMemo(() => {
    const ventasBot = orders
      .filter((o) => o.source === "bot")
      .reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
    const ventasPos = orders
      .filter((o) => o.source === "pos")
      .reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
    const ingresosManuales = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount), 0)
    const gastos = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const ingresosTotales = ventasBot + ventasPos + ingresosManuales
    const ganancia = ingresosTotales - gastos
    const margen = ingresosTotales > 0 ? (ganancia / ingresosTotales) * 100 : 0

    return { ventasBot, ventasPos, ingresosManuales, gastos, ingresosTotales, ganancia, margen, cantVentas: orders.length }
  }, [orders, transactions])

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
      fetchData()
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
      fetchData()
    } catch (err) {
      console.error("Error deleting transaction:", err)
      toast.error("No se pudo eliminar el movimiento")
    } finally {
      setDeleteId(null)
    }
  }

  const categories = form.type === "expense" ? expenseCategories : incomeCategories

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
            <SelectTrigger className="w-[170px] input-field">
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
          {/* KPI Cards */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="executive-card group hover:translate-y-[-2px] transition-transform">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-2xl flex items-center justify-center text-green-500 mb-4">
                <span className="material-symbols-outlined text-2xl">trending_up</span>
              </div>
              <h3 className="text-[#64748B] dark:text-[#94A3B8] text-xs font-semibold uppercase tracking-wider">
                Ingresos totales
              </h3>
              <p className="text-3xl font-black mt-1">{formatMoney(stats.ingresosTotales)}</p>
              <p className="text-[11px] text-[#64748B] mt-4 leading-relaxed">
                {stats.cantVentas} venta{stats.cantVentas === 1 ? "" : "s"} + ingresos manuales en{" "}
                {periodLabels[period].toLowerCase()}
              </p>
            </div>

            <div className="executive-card group hover:translate-y-[-2px] transition-transform">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-2xl flex items-center justify-center text-red-500 mb-4">
                <span className="material-symbols-outlined text-2xl">trending_down</span>
              </div>
              <h3 className="text-[#64748B] dark:text-[#94A3B8] text-xs font-semibold uppercase tracking-wider">
                Gastos
              </h3>
              <p className="text-3xl font-black mt-1">{formatMoney(stats.gastos)}</p>
              <p className="text-[11px] text-[#64748B] mt-4 leading-relaxed">
                {transactions.filter((t) => t.type === "expense").length} gasto
                {transactions.filter((t) => t.type === "expense").length === 1 ? "" : "s"} registrado
                {transactions.filter((t) => t.type === "expense").length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="executive-card group hover:translate-y-[-2px] transition-transform">
              <div className="w-12 h-12 bg-[#D1F366]/10 rounded-2xl flex items-center justify-center text-[#D1F366] mb-4">
                <span className="material-symbols-outlined text-2xl">savings</span>
              </div>
              <h3 className="text-[#64748B] dark:text-[#94A3B8] text-xs font-semibold uppercase tracking-wider">
                Ganancia neta
              </h3>
              <p
                className={cn(
                  "text-3xl font-black mt-1",
                  stats.ganancia < 0 && "text-red-500"
                )}
              >
                {formatMoney(stats.ganancia)}
              </p>
              <p className="text-[11px] text-[#64748B] mt-4 leading-relaxed">
                Margen del {stats.margen.toFixed(1)}% sobre ingresos
              </p>
            </div>

            <div className="executive-card group hover:translate-y-[-2px] transition-transform">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-500 mb-4">
                <span className="material-symbols-outlined text-2xl">storefront</span>
              </div>
              <h3 className="text-[#64748B] dark:text-[#94A3B8] text-xs font-semibold uppercase tracking-wider">
                Origen de ventas
              </h3>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">🤖 Bot</span>
                  <span className="font-bold">{formatMoney(stats.ventasBot)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">🏪 Punto de venta</span>
                  <span className="font-bold">{formatMoney(stats.ventasPos)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">✍️ Manuales</span>
                  <span className="font-bold">{formatMoney(stats.ingresosManuales)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Gráfico ingresos vs gastos */}
          <section className="executive-card">
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
                    contentStyle={{
                      backgroundColor: "var(--background, #1C1C28)",
                      border: "1px solid rgba(148,163,184,0.2)",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
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

          {/* Movimientos manuales */}
          <section className="executive-card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold">Movimientos manuales</h2>
                <p className="text-xs text-muted-foreground">
                  Gastos e ingresos que no pasan por el bot ni el punto de venta
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => openCreate("income")}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ingreso
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold"
                  onClick={() => openCreate("expense")}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Gasto
                </Button>
              </div>
            </div>

            {transactions.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                No hay movimientos en {periodLabels[period].toLowerCase()}. Registrá tu primer
                gasto o ingreso con los botones de arriba.
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 py-3">
                    <Badge
                      className={cn(
                        "flex-shrink-0",
                        tx.type === "expense"
                          ? "bg-red-500/15 text-red-500 border-red-500/30 hover:bg-red-500/20"
                          : "bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/20"
                      )}
                    >
                      {tx.type === "expense" ? "Gasto" : "Ingreso"}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {categoryLabel(tx.type, tx.category)}
                        {tx.description ? (
                          <span className="text-muted-foreground font-normal"> · {tx.description}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.transaction_date + "T00:00:00").toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {tx.payment_method
                          ? ` · ${paymentMethods.find((p) => p.id === tx.payment_method)?.label || tx.payment_method}`
                          : ""}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "text-sm font-bold flex-shrink-0",
                        tx.type === "expense" ? "text-red-500" : "text-green-600"
                      )}
                    >
                      {tx.type === "expense" ? "-" : "+"}
                      {formatMoney(Number(tx.amount))}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        onClick={() => openEdit(tx)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-500"
                        onClick={() => setDeleteId(tx.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
