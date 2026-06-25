"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Users, Plus, Trash2, Loader2, UserCog } from "lucide-react"
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

function sectionsOf(m: Member): string[] {
  return (m.sidebar_config || []).filter((s) => s.visible).map((s) => s.id)
}

export function TeamManagement() {
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<Member[]>([])
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [sections, setSections] = useState<string[]>(DEFAULT_SECTIONS)
  const [creating, setCreating] = useState(false)

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
  useEffect(() => {
    load()
  }, [])

  const toggle = (id: string) =>
    setSections((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

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
      if (!res.ok) {
        toast.error(j.error || "No se pudo crear")
        return
      }
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#D1F366]" />
          Equipo (empleados con cuenta)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Creá cuentas para tu personal y elegí qué secciones puede ver. Operan sobre los datos de tu negocio,
          pero no ven facturación, bots ni administración.
        </p>

        {/* Lista */}
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

        {/* Crear */}
        <div className="border-t border-border pt-4 space-y-3">
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
      </CardContent>
    </Card>
  )
}
