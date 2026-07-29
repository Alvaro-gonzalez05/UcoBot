"use client"

import { useEffect, useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, CircleDollarSign, CheckCircle2, Settings2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

/**
 * Cobranza manual de clientes.
 *
 * Los clientes con acuerdo particular (promos, precios distintos) no pasan por
 * Mercado Pago y hasta ahora se llevaban de memoria. Acá se registra cuánto se le
 * cobra a cada uno, cada cuánto, y cuándo toca el próximo.
 */

type Billing = {
  amount: number
  currency: string
  cycle: string
  included_accounts: number
  extra_account_price: number
  next_charge_date: string | null
  notes: string | null
  is_active: boolean
}

type Cliente = {
  user_id: string
  business_name: string | null
  email: string | null
  plan_type: string | null
  billing_exempt: boolean | null
  billing: Billing | null
  dias_para_cobro: number | null
}

const CICLOS: Record<string, string> = {
  monthly: "Mensual",
  quarterly: "Trimestral",
  biannual: "Semestral",
  annual: "Anual",
}

function money(amount: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Estado de vencimiento: define el color y el orden de la lista. */
function estado(dias: number | null) {
  if (dias === null) return { label: "Sin configurar", tone: "gris", orden: 3 }
  if (dias < 0) return { label: `Vencido hace ${Math.abs(dias)} d`, tone: "rojo", orden: 0 }
  if (dias <= 7) return { label: dias === 0 ? "Vence hoy" : `En ${dias} d`, tone: "ambar", orden: 1 }
  return { label: `En ${dias} d`, tone: "verde", orden: 2 }
}

const TONE_CLASS: Record<string, string> = {
  rojo: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400",
  ambar: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
  verde: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400",
  gris: "bg-muted text-muted-foreground border-border",
}

export function BillingManager() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [saving, setSaving] = useState(false)
  const [charging, setCharging] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/billing")
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "No se pudo cargar la cobranza")
        return
      }
      setClientes(json.clientes || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const save = async (form: Billing & { user_id: string }) => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "No se pudo guardar")
        return
      }
      toast.success("Cobranza actualizada")
      setEditing(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  const marcarCobrado = async (c: Cliente) => {
    if (!confirm(`¿Registrar el cobro de ${c.business_name || "este cliente"}? Se avanza la fecha al próximo período.`)) return
    setCharging(c.user_id)
    try {
      const res = await fetch("/api/admin/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: c.user_id }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "No se pudo registrar")
        return
      }
      toast.success(`Cobrado. Próximo: ${json.proximo_cobro}`)
      load()
    } finally {
      setCharging(null)
    }
  }

  // Lo vencido primero: es una lista para actuar, no para consultar.
  const ordenados = [...clientes].sort((a, b) => {
    const ea = estado(a.dias_para_cobro)
    const eb = estado(b.dias_para_cobro)
    if (ea.orden !== eb.orden) return ea.orden - eb.orden
    return (a.dias_para_cobro ?? 999) - (b.dias_para_cobro ?? 999)
  })

  const vencidos = clientes.filter((c) => (c.dias_para_cobro ?? 99) < 0)
  const porVencer = clientes.filter((c) => {
    const d = c.dias_para_cobro
    return d !== null && d >= 0 && d <= 7
  })
  const mrr = clientes
    .filter((c) => c.billing?.is_active && c.billing.cycle === "monthly")
    .reduce((acc, c) => acc + Number(c.billing?.amount || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando cobranza…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-3xl p-5 border border-border">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Vencidos</p>
          <p className={`text-2xl font-bold ${vencidos.length > 0 ? "text-red-500" : "dark:text-white"}`}>
            {vencidos.length}
          </p>
        </div>
        <div className="bg-card rounded-3xl p-5 border border-border">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Vencen esta semana</p>
          <p className={`text-2xl font-bold ${porVencer.length > 0 ? "text-amber-500" : "dark:text-white"}`}>
            {porVencer.length}
          </p>
        </div>
        <div className="bg-card rounded-3xl p-5 border border-border">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Mensual recurrente</p>
          <p className="text-2xl font-bold dark:text-white">{money(mrr)}</p>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-card rounded-3xl border border-border overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <h3 className="font-bold text-base dark:text-white">Clientes</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Los vencidos aparecen primero. Configurá cuánto y cada cuánto se le cobra a cada uno.
          </p>
        </div>
        <div className="divide-y divide-border">
          {ordenados.map((c) => {
            const e = estado(c.dias_para_cobro)
            const b = c.billing
            return (
              <div key={c.user_id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate dark:text-white">
                      {c.business_name || "Sin nombre"}
                    </p>
                    {c.billing_exempt && (
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">exento</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                  {b && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {money(Number(b.amount), b.currency)} · {CICLOS[b.cycle] || b.cycle}
                      {b.included_accounts > 1 && ` · ${b.included_accounts} cuentas`}
                      {b.notes && ` · ${b.notes}`}
                    </p>
                  )}
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex-shrink-0 ${TONE_CLASS[e.tone]}`}
                >
                  {e.label}
                </span>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {b?.is_active && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5 rounded-xl"
                      disabled={charging === c.user_id}
                      onClick={() => marcarCobrado(c)}
                    >
                      {charging === c.user_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Cobrado
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs gap-1.5 rounded-xl"
                    onClick={() => setEditing(c)}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    {b ? "Editar" : "Configurar"}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {editing && (
        <BillingDialog
          cliente={editing}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  )
}

function BillingDialog({
  cliente,
  saving,
  onClose,
  onSave,
}: {
  cliente: Cliente
  saving: boolean
  onClose: () => void
  onSave: (form: any) => void
}) {
  const b = cliente.billing
  const [amount, setAmount] = useState(String(b?.amount ?? ""))
  const [cycle, setCycle] = useState(b?.cycle ?? "monthly")
  const [included, setIncluded] = useState(String(b?.included_accounts ?? 1))
  const [extra, setExtra] = useState(String(b?.extra_account_price ?? 0))
  const [next, setNext] = useState(b?.next_charge_date ?? "")
  const [notes, setNotes] = useState(b?.notes ?? "")

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cobranza — {cliente.business_name || "Cliente"}</DialogTitle>
          <DialogDescription>
            Cuánto se le cobra y cada cuánto. Solo lo ve el administrador.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Monto</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="90000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cada</Label>
              <Select value={cycle} onValueChange={setCycle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CICLOS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cuentas incluidas</Label>
              <Input
                type="number"
                value={included}
                onChange={(e) => setIncluded(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Precio cuenta extra</Label>
              <Input
                type="number"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Próximo cobro</Label>
            <Input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notas</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: promo 3 meses, después pasa a precio de lista"
            />
          </div>

          {!next && (
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>Sin fecha de próximo cobro no aparece en las alertas.</span>
            </div>
          )}

          <Button
            className="w-full bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl gap-2"
            disabled={saving}
            onClick={() =>
              onSave({
                user_id: cliente.user_id,
                amount: Number(amount) || 0,
                currency: "ARS",
                cycle,
                included_accounts: Number(included) || 1,
                extra_account_price: Number(extra) || 0,
                next_charge_date: next || null,
                notes: notes || null,
                is_active: true,
              })
            }
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleDollarSign className="h-4 w-4" />}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
