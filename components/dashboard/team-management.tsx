"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Users, Plus, Trash2, Loader2, UserCog, Store, Copy, Check,
  KeyRound, RefreshCw, Building2, AlertCircle,
} from "lucide-react"
import { toast } from "sonner"

const SECTIONS: { id: string; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "reservas", label: "Reservas / Turnos" },
  { id: "pedidos", label: "Pedidos" },
  { id: "punto-de-venta", label: "Punto de venta" },
  { id: "clientes", label: "Clientes" },
  { id: "promociones", label: "Promociones" },
  { id: "formularios", label: "Formularios" },
]
const DEFAULT_SECTIONS = ["chat", "reservas", "pedidos", "punto-de-venta"]

interface Member {
  id: string
  full_name: string
  sidebar_config: { id: string; visible: boolean }[]
}
interface Branch {
  userId: string
  branchName: string
  email: string
}

function sectionsOf(m: Member): string[] {
  return (m.sidebar_config || []).filter((s) => s.visible).map((s) => s.id)
}

// Botón de copiar reutilizable
function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error("No se pudo copiar")
        }
      }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title={`Copiar ${label || ""}`.trim()}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

export function TeamManagement() {
  // ── Empleados ──
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<Member[]>([])
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [sections, setSections] = useState<string[]>(DEFAULT_SECTIONS)
  const [creating, setCreating] = useState(false)

  // ── Sucursales ──
  const [businessName, setBusinessName] = useState("")
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchName, setBranchName] = useState("")
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [loadingBranches, setLoadingBranches] = useState(true)
  const [isBranch, setIsBranch] = useState(false)
  // Contraseñas mostradas recién (al crear/regenerar). No persisten.
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [busyBranch, setBusyBranch] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch("/api/team")
      const j = await res.json()
      setMembers(j.members || [])
    } catch {
      /* noop */
    } finally {
      setLoading(false)
    }
  }
  const loadBranches = async () => {
    try {
      const res = await fetch("/api/team/branches")
      const j = await res.json()
      setBusinessName(j.businessName || "")
      setBranches(j.branches || [])
      setIsBranch(Boolean(j.isBranch))
    } catch {
      /* noop */
    } finally {
      setLoadingBranches(false)
    }
  }
  useEffect(() => {
    load()
    loadBranches()
  }, [])

  const toggle = (id: string) =>
    setSections((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  // ── Sucursales: acciones ──
  const createBranch = async () => {
    if (!branchName.trim()) {
      toast.error("Poné un nombre para la sucursal")
      return
    }
    setCreatingBranch(true)
    try {
      const res = await fetch("/api/team/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchName }),
      })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error || "No se pudo crear la sucursal")
        return
      }
      toast.success("Sucursal creada")
      setBranches((b) => [...b, j.branch])
      setRevealed((r) => ({ ...r, [j.branch.userId]: j.password }))
      setBranchName("")
    } catch {
      toast.error("Error de red")
    } finally {
      setCreatingBranch(false)
    }
  }

  const regeneratePassword = async (userId: string) => {
    setBusyBranch(userId)
    try {
      const res = await fetch("/api/team/branches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error || "No se pudo regenerar")
        return
      }
      setRevealed((r) => ({ ...r, [userId]: j.password }))
      toast.success("Contraseña regenerada")
    } catch {
      toast.error("Error de red")
    } finally {
      setBusyBranch(null)
    }
  }

  const deleteBranch = async (userId: string) => {
    if (!confirm("¿Eliminar esta sucursal? Se borra su cuenta y todos sus datos. No se puede deshacer.")) return
    setBusyBranch(userId)
    try {
      const res = await fetch("/api/team/branches", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) {
        const j = await res.json()
        toast.error(j.error || "No se pudo eliminar")
        return
      }
      setBranches((b) => b.filter((x) => x.userId !== userId))
      setRevealed((r) => { const n = { ...r }; delete n[userId]; return n })
      toast.success("Sucursal eliminada")
    } catch {
      toast.error("Error de red")
    } finally {
      setBusyBranch(null)
    }
  }

  // ── Empleados: acciones (sin cambios de lógica) ──
  const createMember = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) {
      toast.error("Completá nombre, email y contraseña (mín. 6)")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, sections }),
      })
      const j = await res.json()
      if (!res.ok) { toast.error(j.error || "No se pudo crear"); return }
      toast.success("Empleado creado")
      setName(""); setEmail(""); setPassword(""); setSections(DEFAULT_SECTIONS)
      load()
    } catch {
      toast.error("Error de red")
    } finally {
      setCreating(false)
    }
  }

  const updateSections = async (memberId: string, secs: string[]) => {
    setMembers((m) => m.map((x) => (x.id === memberId ? { ...x, sidebar_config: SECTIONS.map((s) => ({ id: s.id, visible: secs.includes(s.id) })) } : x)))
    await fetch("/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, sections: secs }),
    })
  }

  const deleteMember = async (memberId: string) => {
    setMembers((m) => m.filter((x) => x.id !== memberId))
    await fetch("/api/team", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    })
    toast.success("Empleado eliminado")
  }

  return (
    <div className="space-y-4">
      {/* Encabezado del negocio */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="w-11 h-11 rounded-xl bg-[#D1F366]/15 text-[#4a7c00] dark:text-[#D1F366] flex items-center justify-center flex-shrink-0">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Negocio</p>
          <p className="font-bold truncate">{businessName || "Tu negocio"}</p>
        </div>
      </div>

      <Tabs defaultValue="sucursales" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-sm">
          <TabsTrigger value="sucursales" className="gap-1.5"><Store className="h-4 w-4" /> Sucursales</TabsTrigger>
          <TabsTrigger value="empleados" className="gap-1.5"><Users className="h-4 w-4" /> Empleados</TabsTrigger>
        </TabsList>

        {/* ─────────── SUCURSALES ─────────── */}
        <TabsContent value="sucursales" className="space-y-4 mt-4">
          {isBranch ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/15 px-4 py-4">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">Solo la casa central puede gestionar sucursales</p>
                <p className="text-sm text-amber-800 dark:text-amber-400 mt-0.5">
                  Estás en la cuenta de una sucursal. La creación y el listado de sucursales se manejan
                  únicamente desde la cuenta de casa central. Desde acá sí podés gestionar los empleados de tu sucursal.
                </p>
              </div>
            </div>
          ) : (
          <>
          <p className="text-sm text-muted-foreground">
            Cada sucursal es una cuenta propia, con su WhatsApp, su chatbot y sus datos.
            Creás una, te damos el usuario y la contraseña para entregarle al encargado.
          </p>

          {/* Crear sucursal */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-[#4a7c00] dark:text-[#D1F366]" /> Nueva sucursal</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Nombre de la sucursal (ej: Centro, Sucursal Norte)"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createBranch()}
                className="flex-1"
              />
              <Button onClick={createBranch} disabled={creatingBranch} className="gap-1.5 bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold">
                {creatingBranch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Crear sucursal
              </Button>
            </div>
          </div>

          {/* Grid de sucursales */}
          {loadingBranches ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : branches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-10 flex flex-col items-center text-center gap-2">
              <Store className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Todavía no creaste sucursales.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              {/* Encabezado del grid (desktop) */}
              <div className="hidden sm:grid grid-cols-[1.2fr_1.6fr_auto] gap-3 px-4 py-2.5 border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Sucursal</span>
                <span>Usuario y contraseña</span>
                <span className="text-right">Acciones</span>
              </div>
              <div className="divide-y divide-border">
                {branches.map((b) => (
                  <div key={b.userId} className="grid grid-cols-1 sm:grid-cols-[1.2fr_1.6fr_auto] gap-2 sm:gap-3 px-4 py-3 items-center">
                    {/* Nombre */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Store className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span className="font-medium text-sm truncate">{b.branchName}</span>
                    </div>

                    {/* Credenciales */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground text-xs w-16 flex-shrink-0">Usuario</span>
                        <span className="font-mono text-xs truncate">{b.email}</span>
                        <CopyButton value={b.email} label="usuario" />
                      </div>
                      {revealed[b.userId] ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground text-xs w-16 flex-shrink-0">Contraseña</span>
                          <span className="font-mono text-xs bg-amber-400/15 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">{revealed[b.userId]}</span>
                          <CopyButton value={revealed[b.userId]} label="contraseña" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="w-16 flex-shrink-0">Contraseña</span>
                          <span className="italic">oculta — regenerá para verla</span>
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1 sm:justify-end">
                      <button
                        onClick={() => regeneratePassword(b.userId)}
                        disabled={busyBranch === b.userId}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
                        title="Regenerar contraseña"
                      >
                        {busyBranch === b.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                        <span className="hidden sm:inline">Contraseña</span>
                      </button>
                      <button
                        onClick={() => deleteBranch(b.userId)}
                        disabled={busyBranch === b.userId}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Eliminar sucursal"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(revealed).length > 0 && (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
              Copiá la contraseña ahora: por seguridad no se guarda y no se vuelve a mostrar. Si la perdés, usá “Contraseña” para generar una nueva.
            </p>
          )}
          </>
          )}
        </TabsContent>

        {/* ─────────── EMPLEADOS ─────────── */}
        <TabsContent value="empleados" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Cuentas para tu personal. Operan sobre los datos de tu negocio (o de la sucursal donde entren)
            y solo ven las secciones que habilites. No ven facturación, bots ni administración.
          </p>

          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : members.length > 0 ? (
            <div className="space-y-3">
              {members.map((m) => {
                const secs = sectionsOf(m)
                return (
                  <div key={m.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <UserCog className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium text-sm truncate">{m.full_name || "Empleado"}</span>
                      </div>
                      <button onClick={() => deleteMember(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {SECTIONS.map((s) => {
                        const on = secs.includes(s.id)
                        return (
                          <button
                            key={s.id}
                            onClick={() => updateSections(m.id, on ? secs.filter((x) => x !== s.id) : [...secs, s.id])}
                            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                              on ? "bg-[#D1F366] text-[#1C1C28] border-[#D1F366]" : "border-border hover:bg-muted"
                            }`}
                          >
                            {s.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Todavía no creaste empleados.</p>
          )}

          {/* Crear empleado */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-semibold">Nuevo empleado</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input placeholder="Contraseña (mín. 6)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Secciones que puede ver</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {SECTIONS.map((s) => {
                  const on = sections.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                        on ? "bg-[#D1F366] text-[#1C1C28] border-[#D1F366]" : "border-border hover:bg-muted"
                      }`}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <Button onClick={createMember} disabled={creating} className="gap-1.5 bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crear empleado
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
