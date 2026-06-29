"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { ClipboardList, Plus, FileText, Package } from "lucide-react"
import { RowActions } from "./row-actions"

const ESTADO: Record<string, { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  listo: { label: "Listo", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  volcado: { label: "Volcado", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  oficializado: { label: "Oficializado", cls: "bg-green-100 text-green-700 border-green-200" },
  anulado: { label: "Anulado", cls: "bg-red-100 text-red-700 border-red-200" },
}

export function ViajesClient({ trips }: { trips: any[] }) {
  const supabase = createClient()
  const router = useRouter()

  const open = (id: string) => router.push(`/dashboard/transporte/viajes/${id}`)

  const handleDelete = (t: any) => {
    toast("¿Eliminar este viaje?", {
      description: "Se borran sus CRT, contenedores y precintos. No se puede deshacer.",
      action: {
        label: "Eliminar",
        onClick: async () => {
          const { error } = await supabase.from("transport_trips").delete().eq("id", t.id)
          if (error) return toast.error("No se pudo eliminar el viaje.")
          toast.success("Viaje eliminado."); router.refresh()
        },
      },
    })
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-6 px-1 pt-2 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold">Viajes (MIC/DTA)</h2>
          <p className="text-muted-foreground text-sm mt-1">Tus manifiestos y cartas de porte, con su estado.</p>
        </div>
        <Link href="/dashboard/transporte/cargar-viaje" className="inline-flex items-center rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold px-4 py-2.5 text-sm hover:bg-[#B3D93C] transition">
          <Plus className="h-4 w-4 mr-1.5" /> Cargar viaje
        </Link>
      </div>

      {trips.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-12 flex flex-col items-center text-center shadow-sm">
          <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">Todavía no hay viajes</h3>
          <p className="text-sm text-muted-foreground mb-4">Subí un permiso de embarque y armamos el primero.</p>
          <Link href="/dashboard/transporte/cargar-viaje" className="inline-flex items-center rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold px-4 py-2.5 text-sm hover:bg-[#B3D93C] transition">
            <Plus className="h-4 w-4 mr-1.5" /> Cargar viaje
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {trips.map((t) => {
            const crt = Array.isArray(t.transport_crts) ? t.transport_crts[0] : t.transport_crts
            const permit = crt?.transport_shipping_permits
            const e = ESTADO[t.estado] || ESTADO.borrador
            return (
              <div key={t.id} className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center justify-between gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <button onClick={() => open(t.id)} className="flex items-center gap-5 min-w-0 text-left flex-1">
                  <div className="w-14 h-14 rounded-2xl bg-[#1C1C28] text-[#D1F366] flex items-center justify-center flex-shrink-0">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h4 className="font-bold text-lg truncate">{t.mic_clave || permit?.permit_number || "MIC/DTA en borrador"}</h4>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${e.cls}`}>{e.label}</span>
                      {t.consolidado && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">consolidado</span>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      {permit?.exporter_razon_social || "—"}
                      {crt?.descripcion_mercaderia ? ` · ${crt.descripcion_mercaderia}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(t.created_at).toLocaleDateString("es-AR")}</p>
                  </div>
                </button>
                <RowActions onEdit={() => open(t.id)} onDelete={() => handleDelete(t)} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
