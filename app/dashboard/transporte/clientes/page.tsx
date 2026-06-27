import { requireTransporte } from "@/lib/transporte/guard"
import { Building2, BadgeCheck } from "lucide-react"

export const dynamic = "force-dynamic"

const ROLE_CLS: Record<string, string> = {
  exportador: "bg-indigo-50 text-indigo-700 border-indigo-200",
  consignatario: "bg-teal-50 text-teal-700 border-teal-200",
  destinatario: "bg-violet-50 text-violet-700 border-violet-200",
  notificar: "bg-amber-50 text-amber-700 border-amber-200",
}

export default async function ClientesPage() {
  const { supabase, user } = await requireTransporte()
  const { data: clients } = await supabase
    .from("transport_clients").select("*").eq("user_id", user.id)
    .order("created_at", { ascending: false })
  const list = clients || []

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 px-1 pt-2">
        <h2 className="text-3xl font-bold">Clientes de comercio exterior</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Exportadores, consignatarios y destinatarios. Se crean solos al cargar viajes.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-12 flex flex-col items-center text-center shadow-sm">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">Todavía no hay clientes</h3>
          <p className="text-sm text-muted-foreground">Al cargar un viaje, el exportador y el cliente del exterior se registran automáticamente.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {list.map((c: any) => (
            <div key={c.id} className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center justify-between gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="flex items-center gap-5 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-lg truncate">{c.razon_social}</h4>
                    {c.needs_review && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700 border border-amber-200">revisar</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {c.tax_id ? `${c.tax_id_type || "ID"} ${c.tax_id}` : "Sin identificación tributaria"}
                    {c.domicilio ? ` · ${c.domicilio}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(c.roles || []).map((r: string) => (
                      <span key={r} className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${ROLE_CLS[r] || "bg-gray-50 text-gray-600 border-gray-200"}`}>{r}</span>
                    ))}
                  </div>
                </div>
              </div>
              {c.source !== "manual" && (
                <span className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <BadgeCheck className="h-4 w-4 text-emerald-500" /> auto
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
