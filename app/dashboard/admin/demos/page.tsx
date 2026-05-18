import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bot, ExternalLink, Clock, CheckCircle2, Building2 } from "lucide-react"
import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/server"

const FEATURE_LABELS: Record<string, string> = {
  register_clients: "Registro clientes",
  take_orders: "Pedidos",
  manage_appointments: "Citas/Reuniones",
  lead_qualification: "Calificación leads",
  loyalty_points: "Puntos fidelidad",
  custom_forms: "Formularios",
}

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  real_estate: "Inmobiliaria",
  restaurant: "Restaurante",
  law_firm: "Estudio Jurídico",
  ecommerce: "E-commerce",
  health: "Salud",
  education: "Educación",
  general: "General",
}

export default async function DemosAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") redirect("/dashboard")

  const adminClient = createAdminClient()
  const { data: demos } = await adminClient
    .from("demo_sessions")
    .select("*")
    .order("created_at", { ascending: false })

  const activeCount = demos?.filter((d) => d.status === "active").length || 0
  const claimedCount = demos?.filter((d) => d.status === "claimed").length || 0

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Demos / Leads</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Potenciales clientes que probaron el configurador de bots
          </p>
        </div>
        <div className="flex gap-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">{activeCount}</div>
            <div className="text-xs text-muted-foreground">Sin activar</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{claimedCount}</div>
            <div className="text-xs text-muted-foreground">Activados</div>
          </div>
        </div>
      </div>

      {(!demos || demos.length === 0) && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No hay demos todavía.</p>
            <p className="text-sm mt-1">
              Compartí el link{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/demo</code>{" "}
              con potenciales clientes.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {demos?.map((demo) => (
          <Card key={demo.id} className={demo.status === "claimed" ? "opacity-60" : ""}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-[#CCFF00]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-base">{demo.business_name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {BUSINESS_TYPE_LABELS[demo.business_type] || demo.business_type || "General"}
                      </Badge>
                      {demo.status === "claimed" ? (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Activado
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs">
                          Pendiente
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mt-0.5">
                      <span className="font-medium text-foreground">{demo.contact_name}</span>
                      {demo.contact_email && <> · {demo.contact_email}</>}
                    </p>

                    {demo.business_summary && (
                      <p className="text-sm text-muted-foreground mt-1 italic">"{demo.business_summary}"</p>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(demo.features as string[])?.map((f) => (
                        <span
                          key={f}
                          className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground"
                        >
                          {FEATURE_LABELS[f] || f}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {new Date(demo.created_at).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 flex-shrink-0">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/demo/${demo.id}`} target="_blank">
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                      Ver demo
                    </Link>
                  </Button>
                  {demo.status === "active" && (
                    <Button size="sm" className="bg-[#CCFF00] text-black hover:bg-[#b8e600]" asChild>
                      <Link href={`/dashboard/admin/users?activateDemo=${demo.id}`}>
                        Activar cuenta
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              {demo.business_description && (
                <details className="mt-3">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                    Ver descripción del negocio
                  </summary>
                  <p className="text-sm text-muted-foreground mt-2 pl-2 border-l border-border leading-relaxed">
                    {demo.business_description}
                  </p>
                </details>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
