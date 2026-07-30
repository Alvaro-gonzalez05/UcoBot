"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Loader2 } from "lucide-react"

/**
 * Secciones del panel lateral de un cliente, editables desde el admin.
 *
 * Es el mismo `sidebar_config` que el cliente puede tocar en sus ajustes; acá se
 * expone para poder dejarle la cuenta lista al darla de alta, o habilitarle un
 * módulo nuevo sin pedirle que entre a configurarlo.
 */

/** Mismo catálogo que ve el cliente en sus ajustes. */
const SECTIONS = [
  { id: "dashboard", label: "Resumen" },
  { id: "bots", label: "Chatbots" },
  { id: "chat", label: "Mensajes" },
  { id: "clientes", label: "Clientes" },
  { id: "punto-de-venta", label: "Punto de venta" },
  { id: "finanzas", label: "Finanzas" },
  { id: "pedidos", label: "Pedidos" },
  { id: "reservas", label: "Reservas" },
  { id: "formularios", label: "Formularios" },
  { id: "promociones", label: "Promociones" },
  { id: "automatizaciones", label: "Automatizaciones" },
]

type Section = { id: string; label: string; visible: boolean }

export function UserMenusCard({
  userId,
  savedConfig,
}: {
  userId: string
  savedConfig: { id: string; label?: string; visible?: boolean }[] | null
}) {
  // Se parte del catálogo completo y se le aplica lo guardado: si el cliente
  // nunca configuró nada, `savedConfig` viene vacío y todo va visible, que es el
  // comportamiento por defecto del panel.
  const [sections, setSections] = useState<Section[]>(() =>
    SECTIONS.map((s) => {
      const saved = savedConfig?.find((x) => x.id === s.id)
      return { ...s, visible: saved ? saved.visible !== false : true }
    })
  )
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const toggle = (id: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s))
    )
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/user-menus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, sections }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo guardar")
      toast.success("Menús actualizados", {
        description: "El cliente los va a ver al recargar su panel.",
      })
      setDirty(false)
    } catch (e) {
      toast.error("No se pudo guardar", {
        description: e instanceof Error ? e.message : "Intentá de nuevo",
      })
    } finally {
      setSaving(false)
    }
  }

  const visibles = sections.filter((s) => s.visible).length

  return (
    <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base dark:text-white">Menús del panel</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Qué secciones ve este cliente en su barra lateral. {visibles} de{" "}
            {sections.length} activas.
          </p>
        </div>
        <Button size="sm" onClick={save} disabled={!dirty || saving} className="flex-shrink-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
        </Button>
      </div>

      <div className="divide-y divide-border">
        {sections.map((s) => (
          <label
            key={s.id}
            htmlFor={`menu-${s.id}`}
            className="flex items-center justify-between gap-3 px-6 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
          >
            <span className="text-sm font-medium dark:text-white">{s.label}</span>
            <Switch id={`menu-${s.id}`} checked={s.visible} onCheckedChange={() => toggle(s.id)} />
          </label>
        ))}
      </div>
    </div>
  )
}
