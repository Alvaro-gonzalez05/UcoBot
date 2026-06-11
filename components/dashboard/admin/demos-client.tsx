"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Bot,
  Clock,
  CheckCircle2,
  Building2,
  Zap,
  ArrowLeft,
} from "lucide-react"
import Link from "next/link"
import { ActivateDemoDialog } from "./activate-demo-dialog"
import { DeleteDemoButton } from "./delete-demo-button"

const FEATURE_LABELS: Record<string, string> = {
  register_clients: "Registro clientes",
  take_orders: "Pedidos",
  manage_appointments: "Citas/Reuniones",
  lead_qualification: "Calificación leads",
  loyalty_points: "Puntos fidelidad",
  custom_forms: "Formularios",
  take_reservations: "Reservas",
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

interface Demo {
  id: string
  business_name: string
  business_type: string
  contact_name?: string
  contact_email?: string
  business_summary?: string
  business_description?: string
  features?: string[]
  status: "active" | "claimed"
  created_at: string
}

interface DemosClientProps {
  demos: Demo[]
}

export function DemosClient({ demos }: DemosClientProps) {
  const [activatingDemo, setActivatingDemo] = useState<Demo | null>(null)

  const activeCount = demos.filter((d) => d.status === "active").length
  const claimedCount = demos.filter((d) => d.status === "claimed").length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4 px-1 pt-2">
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="rounded-xl h-9 w-9 flex-shrink-0"
        >
          <Link href="/dashboard/admin">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-3xl font-bold dark:text-white">Demos / Leads</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Potenciales clientes que probaron el configurador de bots.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-[#D1F366]/10 dark:bg-[#D1F366]/10 text-[#4a7c00] dark:text-[#D1F366] rounded-2xl flex items-center justify-center flex-shrink-0">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Total demos
            </p>
            <p className="text-2xl font-bold dark:text-white">{demos.length}</p>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Sin activar
            </p>
            <p className="text-2xl font-bold dark:text-white">{activeCount}</p>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4 col-span-2 lg:col-span-1">
          <div className="w-12 h-12 bg-green-50 dark:bg-green-900/30 text-green-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Activados
            </p>
            <p className="text-2xl font-bold dark:text-white">{claimedCount}</p>
          </div>
        </div>
      </div>

      {/* Demo cards */}
      {demos.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-16 flex flex-col items-center justify-center text-center gap-3 shadow-sm">
          <Bot className="w-10 h-10 text-muted-foreground opacity-20" />
          <p className="text-muted-foreground">No hay demos todavía.</p>
          <p className="text-sm text-muted-foreground">
            Compartí el link{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded-lg text-xs">
              /demo
            </code>{" "}
            con potenciales clientes.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {demos.map((demo) => (
            <div
              key={demo.id}
              className={`bg-card rounded-3xl shadow-sm border border-border overflow-hidden transition-all hover:shadow-md ${
                demo.status === "claimed" ? "opacity-60" : ""
              }`}
            >
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="w-11 h-11 rounded-2xl bg-[#D1F366]/10 border border-[#D1F366]/20 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-[#D1F366]" />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <h3 className="font-bold text-base dark:text-white">
                            {demo.business_name}
                          </h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-border bg-muted text-muted-foreground">
                            {BUSINESS_TYPE_LABELS[demo.business_type] ||
                              demo.business_type ||
                              "General"}
                          </span>
                          {demo.status === "claimed" ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Activado
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400">
                              Pendiente
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {demo.contact_name}
                          </span>
                          {demo.contact_email && (
                            <> · {demo.contact_email}</>
                          )}
                        </p>

                        {demo.business_summary && (
                          <p className="text-sm text-muted-foreground mt-1 italic">
                            "{demo.business_summary}"
                          </p>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <DeleteDemoButton
                          demoId={demo.id}
                          demoName={demo.business_name}
                        />
                        {demo.status === "active" && (
                          <Button
                            size="sm"
                            className="rounded-xl h-8 text-xs bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold"
                            onClick={() => setActivatingDemo(demo)}
                          >
                            <Zap className="w-3.5 h-3.5 mr-1" />
                            Activar cuenta
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Features */}
                    {(demo.features as string[])?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {(demo.features as string[]).map((f) => (
                          <span
                            key={f}
                            className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground border border-border"
                          >
                            {FEATURE_LABELS[f] || f}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Date */}
                    <div className="flex items-center gap-1 mt-2.5 text-xs text-muted-foreground">
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

                {/* Collapsible description */}
                {demo.business_description && (
                  <details className="mt-3">
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors ml-[60px]">
                      Ver descripción del negocio
                    </summary>
                    <p className="text-sm text-muted-foreground mt-2 ml-[60px] pl-3 border-l border-border leading-relaxed">
                      {demo.business_description}
                    </p>
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activation dialog */}
      {activatingDemo && (
        <ActivateDemoDialog
          demo={activatingDemo}
          open={!!activatingDemo}
          onOpenChange={(open) => {
            if (!open) setActivatingDemo(null)
          }}
        />
      )}
    </div>
  )
}
