"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Bot, ArrowRight, Loader2, Sparkles, CheckCircle2, Pencil, Check, X } from "lucide-react"

const FEATURE_LABELS: Record<string, string> = {
  register_clients: "Registro de clientes",
  take_orders: "Toma de pedidos",
  manage_appointments: "Agendado de citas",
  lead_qualification: "Calificación de leads",
  loyalty_points: "Puntos de fidelización",
  custom_forms: "Formularios conversacionales",
}

const FEATURE_ICONS: Record<string, string> = {
  register_clients: "👤",
  take_orders: "🛒",
  manage_appointments: "📅",
  lead_qualification: "🎯",
  loyalty_points: "⭐",
  custom_forms: "📋",
}

// Secciones fijas que siempre se incluyen — no configurables
const FIXED_SECTIONS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "chat", label: "Mensajes" },
  { id: "bots", label: "Chatbots" },
  { id: "automations", label: "Automatizaciones" },
]

const FIXED_SECTION_IDS = new Set(FIXED_SECTIONS.map((s) => s.id))

// Qué secciones requiere cada feature (si la feature está activa, la sección es obligatoria)
const FEATURE_SECTION_MAP: Record<string, string[]> = {
  register_clients: ["clients"],
  lead_qualification: ["clients"],
  manage_appointments: ["reservations"],
  take_orders: ["orders", "products"],
  custom_forms: ["forms"],
  loyalty_points: ["promotions"],
}

interface SidebarSectionState {
  id: string
  icon: string
  confirmed: boolean
  label: string
  justification: string
  requiredBy: string[] // features activas que obligan esta sección
}

export default function DemoPage() {
  const router = useRouter()
  const [step, setStep] = useState<"form" | "configuring" | "ready">("form")
  const [form, setForm] = useState({
    contact_name: "",
    business_name: "",
    business_description: "",
    contact_email: "",
  })
  const [configResult, setConfigResult] = useState<any>(null)
  const [botName, setBotName] = useState("")
  const [editingName, setEditingName] = useState(false)
  const [isSavingName, setIsSavingName] = useState(false)
  const [sidebarSections, setSidebarSections] = useState<SidebarSectionState[]>([])
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.contact_name || !form.business_name || !form.business_description) {
      setError("Completá todos los campos obligatorios")
      return
    }
    setError("")
    setStep("configuring")

    try {
      const res = await fetch("/api/demo/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al configurar")

      setConfigResult(data)
      setBotName(data.botNameSuggestion || "")

      // Calcular qué secciones son obligatorias por las features activas
      const sectionRequiredBy: Record<string, string[]> = {}
      ;(data.features || []).forEach((f: string) => {
        (FEATURE_SECTION_MAP[f] || []).forEach((sId) => {
          if (!sectionRequiredBy[sId]) sectionRequiredBy[sId] = []
          sectionRequiredBy[sId].push(FEATURE_LABELS[f] || f)
        })
      })

      // Inicializar secciones del sidebar con lo que eligió la IA
      const sections: SidebarSectionState[] = (data.sidebarConfig || [])
        .filter((s: any) => !FIXED_SECTION_IDS.has(s.id))
        .map((s: any) => {
          const requiredBy = sectionRequiredBy[s.id] || []
          return {
            id: s.id,
            icon: s.icon || "FileText",
            confirmed: s.visible === true || requiredBy.length > 0,
            label: s.label || s.id,
            justification: s.justification || "",
            requiredBy,
          }
        })
      setSidebarSections(sections)
      setStep("ready")
    } catch (err: any) {
      setError(err.message || "Error al procesar la configuración")
      setStep("form")
    }
  }

  const handleSaveName = async () => {
    if (!botName.trim() || !configResult?.sessionId) return
    setIsSavingName(true)
    try {
      await fetch("/api/demo/configure", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: configResult.sessionId, bot_name: botName.trim() }),
      })
    } finally {
      setIsSavingName(false)
      setEditingName(false)
    }
  }

  const toggleSection = (id: string) => {
    setSidebarSections((prev) =>
      prev.map((s) => {
        if (s.id !== id || s.requiredBy.length > 0) return s
        return { ...s, confirmed: !s.confirmed }
      })
    )
  }

  const updateSectionLabel = (id: string, label: string) => {
    setSidebarSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, label } : s))
    )
  }

  const handleGoToChat = async () => {
    if (!configResult?.sessionId) return

    if (editingName) await handleSaveName()

    // Sidebar final = fijas + opcionales confirmadas
    const finalSidebarConfig = [
      ...FIXED_SECTIONS.map((s) => ({ ...s, visible: true, icon: iconForFixed(s.id) })),
      ...sidebarSections
        .filter((s) => s.confirmed)
        .map((s) => ({ id: s.id, label: s.label, visible: true, icon: s.icon })),
    ]

    await fetch("/api/demo/configure", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: configResult.sessionId,
        bot_name: botName.trim(),
        sidebar_config: finalSidebarConfig,
      }),
    })

    router.push(`/demo/${configResult.sessionId}`)
  }

  // ─── CONFIGURING ─────────────────────────────────────────────────────────
  if (step === "configuring") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="relative mx-auto w-20 h-20">
            <div className="w-20 h-20 rounded-2xl bg-[#CCFF00] flex items-center justify-center">
              <Bot className="w-10 h-10 text-black" />
            </div>
            <div className="absolute -inset-2 rounded-3xl border-2 border-[#CCFF00]/30 animate-ping" />
          </div>
          <div className="space-y-2">
            <h2 className="text-white text-2xl font-bold">Configurando tu bot</h2>
            <p className="text-zinc-400 text-sm">La IA está analizando tu negocio y eligiendo las funcionalidades ideales...</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-[#CCFF00]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Esto tarda unos segundos</span>
          </div>
        </div>
      </div>
    )
  }

  // ─── READY ───────────────────────────────────────────────────────────────
  if (step === "ready" && configResult) {
    const justifications: Record<string, string> = configResult.featureJustifications || {}

    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4 py-8">
        <div className="w-full max-w-lg space-y-5">

          {/* Header */}
          <div className="text-center space-y-2">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[#CCFF00] flex items-center justify-center">
              <Bot className="w-7 h-7 text-black" />
            </div>
            <div className="inline-flex items-center gap-1.5 text-[#CCFF00] text-xs font-medium bg-[#CCFF00]/10 px-3 py-1 rounded-full">
              <Sparkles className="w-3 h-3" />
              Bot configurado con IA
            </div>
            <p className="text-zinc-400 text-sm">{configResult.businessSummary}</p>
          </div>

          {/* Nombre del bot — editable */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Nombre del bot</p>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  autoFocus
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#CCFF00]/50"
                  placeholder="Ej: Ana, Lucas, Asistente Wonder..."
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                />
                <button
                  onClick={handleSaveName}
                  disabled={isSavingName}
                  className="bg-[#CCFF00] text-black px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#b8e600] transition-colors disabled:opacity-50"
                >
                  {isSavingName ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="flex items-center gap-2 group w-full"
              >
                <span className="text-white text-xl font-bold">{botName}</span>
                <Pencil className="w-3.5 h-3.5 text-zinc-600 group-hover:text-[#CCFF00] transition-colors" />
              </button>
            )}
            <p className="text-zinc-600 text-xs">La IA sugirió este nombre. Hacé clic para cambiarlo.</p>
          </div>

          {/* Features con justificaciones */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Funcionalidades activadas por la IA</p>
            <div className="space-y-3">
              {(configResult.features as string[]).map((f: string) => (
                <div key={f} className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center flex-shrink-0 text-base">
                    {FEATURE_ICONS[f] || "✅"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#CCFF00] flex-shrink-0" />
                      <span className="text-white text-sm font-medium">{FEATURE_LABELS[f] || f}</span>
                    </div>
                    {justifications[f] && (
                      <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">{justifications[f]}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Secciones del panel */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Secciones de tu panel</p>

            {/* Fijas */}
            <div>
              <p className="text-zinc-600 text-[11px] mb-2">Siempre incluidas</p>
              <div className="flex flex-wrap gap-2">
                {FIXED_SECTIONS.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5"
                  >
                    <CheckCircle2 className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-400 text-xs font-medium">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-zinc-800" />

            {/* AI-suggested */}
            <div>
              <p className="text-zinc-600 text-[11px] mb-3">Seleccionadas por la IA para tu negocio · podés editarlas</p>
              <div className="space-y-3">
                {sidebarSections.map((section) => {
                  const isRequired = section.requiredBy.length > 0
                  return (
                    <div key={section.id} className="flex gap-3 items-start">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleSection(section.id)}
                        disabled={isRequired}
                        title={isRequired ? `Requerido por: ${section.requiredBy.join(", ")}` : undefined}
                        className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                          isRequired
                            ? "bg-[#CCFF00]/50 border-[#CCFF00]/50 cursor-not-allowed"
                            : section.confirmed
                            ? "bg-[#CCFF00] border-[#CCFF00] cursor-pointer"
                            : "border-zinc-600 hover:border-zinc-400 cursor-pointer"
                        }`}
                      >
                        {section.confirmed && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
                      </button>

                      <div className={`flex-1 min-w-0 transition-opacity ${section.confirmed ? "opacity-100" : "opacity-40"}`}>
                        {/* Label editable */}
                        {editingSectionId === section.id ? (
                          <div className="flex gap-1.5 items-center">
                            <input
                              value={section.label}
                              onChange={(e) => updateSectionLabel(section.id, e.target.value)}
                              onBlur={() => setEditingSectionId(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === "Escape") setEditingSectionId(null)
                              }}
                              autoFocus
                              className="flex-1 bg-zinc-800 border border-[#CCFF00]/50 rounded px-2 py-1 text-white text-sm focus:outline-none"
                            />
                            <button
                              onClick={() => setEditingSectionId(null)}
                              className="text-zinc-500 hover:text-white p-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => section.confirmed && setEditingSectionId(section.id)}
                            className="flex items-center gap-1.5 group"
                            disabled={!section.confirmed}
                          >
                            <span className="text-white text-sm font-medium">{section.label}</span>
                            {section.confirmed && (
                              <Pencil className="w-3 h-3 text-zinc-600 group-hover:text-[#CCFF00] transition-colors" />
                            )}
                          </button>
                        )}

                        {/* Requerido por features */}
                        {isRequired && (
                          <p className="text-[11px] mt-0.5">
                            <span className="text-zinc-600">Requerido por: </span>
                            <span className="text-[#CCFF00]/70 font-medium">{section.requiredBy.join(", ")}</span>
                          </p>
                        )}

                        {section.justification && !isRequired && (
                          <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">{section.justification}</p>
                        )}

                        {section.justification && isRequired && (
                          <p className="text-zinc-600 text-xs mt-0.5 leading-relaxed">{section.justification}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="space-y-3">
            <button
              onClick={handleGoToChat}
              className="w-full bg-[#CCFF00] text-black font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-[#b8e600] transition-colors"
            >
              Probar mi bot ahora
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-center text-zinc-600 text-xs">
              Tu configuración quedó guardada. Cuando quieras activar tu cuenta, te la transferimos lista.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── FORM ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[#CCFF00] flex items-center justify-center">
            <Bot className="w-8 h-8 text-black" />
          </div>
          <div>
            <h1 className="text-white text-3xl font-bold tracking-tight">
              Probá tu bot en 60 segundos
            </h1>
            <p className="text-zinc-400 mt-2 text-sm leading-relaxed">
              Contanos sobre tu negocio y la IA configura un asistente personalizado que podés testear ahora mismo.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              Tu nombre <span className="text-[#CCFF00]">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej: Martín García"
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#CCFF00]/50 focus:ring-1 focus:ring-[#CCFF00]/20 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              Nombre del negocio <span className="text-[#CCFF00]">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej: Wonder Real Estate, La Trattoria, Estudio Jurídico..."
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#CCFF00]/50 focus:ring-1 focus:ring-[#CCFF00]/20 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              ¿A qué se dedica y qué necesita del bot? <span className="text-[#CCFF00]">*</span>
            </label>
            <textarea
              rows={5}
              placeholder="Ej: Somos una inmobiliaria premium en Mendoza. Recibimos muchos leads por Instagram y WhatsApp. Necesitamos calificarlos automáticamente, agendar visitas y hacer seguimiento sin perder tiempo..."
              value={form.business_description}
              onChange={(e) => setForm({ ...form, business_description: e.target.value })}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#CCFF00]/50 focus:ring-1 focus:ring-[#CCFF00]/20 transition-all resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              Email de contacto <span className="text-zinc-600">(opcional)</span>
            </label>
            <input
              type="email"
              placeholder="tu@email.com"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#CCFF00]/50 focus:ring-1 focus:ring-[#CCFF00]/20 transition-all"
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            className="w-full bg-[#CCFF00] text-black font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-[#b8e600] transition-colors mt-2"
          >
            <Sparkles className="w-4 h-4" />
            Configurar mi bot con IA
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-center text-zinc-600 text-xs">
            Sin tarjeta de crédito · Sin registrarse · Listo en segundos
          </p>
        </form>
      </div>
    </div>
  )
}

function iconForFixed(id: string): string {
  const map: Record<string, string> = {
    dashboard: "LayoutDashboard",
    chat: "MessageSquare",
    bots: "Bot",
    automations: "Zap",
  }
  return map[id] || "MessageSquare"
}
