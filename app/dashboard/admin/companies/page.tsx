"use client"

import { useEffect, useState } from "react"
import { Building2, Plus, Loader2, Trash2, Shield, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

interface Company {
  id: string
  name: string
  created_at: string
}
interface Member {
  company_id: string
  user_id: string
  branch_name: string | null
  role: string
}
interface Account {
  id: string
  business_name: string | null
  email: string | null
}

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)

  // Estado del formulario de asignación por empresa
  const [assign, setAssign] = useState<Record<string, { user_id: string; branch_name: string; role: string }>>({})

  const load = async () => {
    try {
      const res = await fetch("/api/admin/companies")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Error cargando empresas")
      setCompanies(json.companies)
      setMembers(json.members)
      setAccounts(json.accounts)
    } catch (err: any) {
      toast.error(err?.message || "Error cargando")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const createCompany = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_company", name: newName.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Empresa creada")
      setNewName("")
      load()
    } catch (err: any) {
      toast.error(err?.message || "No se pudo crear")
    } finally {
      setCreating(false)
    }
  }

  const addMember = async (companyId: string) => {
    const form = assign[companyId]
    if (!form?.user_id) {
      toast.error("Elegí una cuenta")
      return
    }
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_member",
          company_id: companyId,
          user_id: form.user_id,
          branch_name: form.branch_name,
          role: form.role || "branch",
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Sucursal asignada")
      setAssign((s) => ({ ...s, [companyId]: { user_id: "", branch_name: "", role: "branch" } }))
      load()
    } catch (err: any) {
      toast.error(err?.message || "No se pudo asignar")
    }
  }

  const removeMember = async (companyId: string, userId: string) => {
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_member", company_id: companyId, user_id: userId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Sucursal quitada")
      load()
    } catch (err: any) {
      toast.error(err?.message || "No se pudo quitar")
    }
  }

  const accountName = (id: string) => {
    const a = accounts.find((x) => x.id === id)
    return a?.business_name || a?.email || id.slice(0, 8)
  }

  // Cuentas aún no asignadas a NINGUNA empresa (un miembro por cuenta, unique)
  const assignedIds = new Set(members.map((m) => m.user_id))
  const freeAccounts = accounts.filter((a) => !assignedIds.has(a.id))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="px-1 pt-2">
        <h2 className="text-3xl font-bold dark:text-white">Empresas y Sucursales</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Cada sucursal es una cuenta. El admin de empresa ve los datos de todas sus sucursales.
        </p>
      </div>

      {/* Crear empresa */}
      <div className="bg-card rounded-3xl p-5 shadow-sm border border-border">
        <p className="font-bold mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Nueva empresa
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Nombre de la empresa (ej: Pizzería Don Juan)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createCompany()}
          />
          <Button onClick={createCompany} disabled={creating} className="gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crear
          </Button>
        </div>
      </div>

      {companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Building2 className="h-8 w-8 opacity-20" />
          <p className="text-sm">Todavía no hay empresas.</p>
        </div>
      ) : (
        companies.map((company) => {
          const companyMembers = members.filter((m) => m.company_id === company.id)
          const form = assign[company.id] || { user_id: "", branch_name: "", role: "branch" }
          return (
            <div key={company.id} className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
              <div className="px-6 pt-5 pb-3 border-b border-border">
                <h3 className="font-bold text-base dark:text-white">{company.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {companyMembers.length} sucursal{companyMembers.length === 1 ? "" : "es"}
                </p>
              </div>

              {/* Sucursales asignadas */}
              <div className="divide-y divide-border">
                {companyMembers.map((m) => (
                  <div key={m.user_id} className="flex items-center gap-3 px-6 py-3">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                      {m.role === "company_admin" ? (
                        <Shield className="h-4 w-4 text-[#4a7c00]" />
                      ) : (
                        <Store className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate dark:text-white">
                        {m.branch_name || accountName(m.user_id)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {accountName(m.user_id)} · {m.role === "company_admin" ? "Admin de empresa (ve todo)" : "Sucursal"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
                      onClick={() => removeMember(company.id, m.user_id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {companyMembers.length === 0 && (
                  <p className="px-6 py-3 text-sm text-muted-foreground">Sin sucursales asignadas.</p>
                )}
              </div>

              {/* Asignar sucursal */}
              <div className="px-6 py-4 border-t border-border bg-muted/20 flex flex-wrap gap-2 items-center">
                <select
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm flex-1 min-w-[160px]"
                  value={form.user_id}
                  onChange={(e) => setAssign((s) => ({ ...s, [company.id]: { ...form, user_id: e.target.value } }))}
                >
                  <option value="">Elegí una cuenta…</option>
                  {freeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.business_name || a.email}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Nombre sucursal (opcional)"
                  className="h-9 flex-1 min-w-[140px]"
                  value={form.branch_name}
                  onChange={(e) => setAssign((s) => ({ ...s, [company.id]: { ...form, branch_name: e.target.value } }))}
                />
                <select
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                  value={form.role}
                  onChange={(e) => setAssign((s) => ({ ...s, [company.id]: { ...form, role: e.target.value } }))}
                >
                  <option value="branch">Sucursal</option>
                  <option value="company_admin">Admin de empresa</option>
                </select>
                <Button size="sm" onClick={() => addMember(company.id)} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Asignar
                </Button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
