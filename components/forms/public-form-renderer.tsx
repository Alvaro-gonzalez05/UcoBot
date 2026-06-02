"use client"

import { useState, useEffect, useRef, type CSSProperties } from "react"
import { toast } from "sonner"

// ---- Color helpers ----
function hexLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function darkenHex(hex: string, factor: number): string {
  return `rgb(${Math.floor(parseInt(hex.slice(1,3),16)*factor)},${Math.floor(parseInt(hex.slice(3,5),16)*factor)},${Math.floor(parseInt(hex.slice(5,7),16)*factor)})`
}

// ---- Types ----
interface FormField {
  id?: string
  type: "text" | "email" | "tel" | "phone" | "number" | "date" | "select" | "radio" | "checkbox" | "textarea" | "product_selector"
  label: string
  placeholder?: string
  required?: boolean
  fullWidth?: boolean
  options?: Array<string | { label: string; value: string }>
  product_category?: string
  product_ids?: string[]
  conditional?: { fieldLabel: string; values: string[] }
  link_url?: string
  link_label?: string
}

interface Product {
  id: string
  name: string
  description?: string
  price: number
  category?: string
  image_url?: string
}

function normalizeOptions(options: FormField["options"]): { label: string; value: string }[] {
  if (!options) return []
  return options.map(o => (typeof o === "string" ? { label: o, value: o } : o))
}

interface FormStep { id: string; title: string; fields: FormField[] }

interface CotizadorConfig {
  enabled: boolean
  showPayment?: boolean
  extraCosts?: Array<{ label: string; amount: number }>
  basePrice?: number; currency?: string; priceLabel?: string; unit?: string
  rules?: Array<{ fieldId: string; value: string; delta: number }>
  breakdown?: Array<{ label: string; fieldId?: string; amount?: number }>
}

interface FormTheme {
  color1?: string; color2?: string
  panelBgType?: "default" | "solid" | "gradient"
  panelBg?: string; panelBgFrom?: string; panelBgTo?: string; panelBorder?: string
  inputBg?: string; inputBorder?: string; inputText?: string
  titleType?: "solid" | "gradient"
  titleColor?: string; titleFrom?: string; titleTo?: string
  bodyColor?: string; labelColor?: string
}

interface FormModel {
  id: string; name: string; description?: string; type: string
  fields?: FormField[]; steps?: FormStep[]; cotizador_config?: CotizadorConfig
  settings?: { logo?: string; theme?: FormTheme }
  slug: string; user_id: string
}

function resolveSteps(form: FormModel): FormStep[] {
  if (form.steps?.length) return form.steps
  if (form.fields?.length) return [{ id: "default", title: form.name, fields: form.fields }]
  return []
}

const KEYFRAMES = `
  @keyframes stepEnterRight { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
  @keyframes stepEnterLeft  { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
  @keyframes dotPop { 0%{transform:scale(1)} 45%{transform:scale(1.35)} 70%{transform:scale(0.92)} 100%{transform:scale(1)} }
  html,body{scrollbar-width:none;-ms-overflow-style:none}
  html::-webkit-scrollbar,body::-webkit-scrollbar{display:none}
`

// ---- Main component ----
export function PublicFormRenderer({ form }: { form: FormModel }) {
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setConversationId(p.get("conv") ?? undefined)
  }, [])

  const steps = resolveSteps(form)
  const cotizador = form.cotizador_config
  const hasCotizador = !!cotizador?.enabled
  const showPayment = !!cotizador?.showPayment
  const logo = form.settings?.logo
  const theme = form.settings?.theme

  const color1 = theme?.color1 || "#b4f577"
  const color2 = theme?.color2 || "#00c6b6"
  const themeGradient = `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`
  const onGradient = hexLuminance(color1) > 0.35 ? darkenHex(color1, 0.25) : "#f0f0f0"
  const onGradientDim = hexLuminance(color1) > 0.35 ? darkenHex(color1, 0.3) + "cc" : "rgba(240,240,240,0.8)"

  const [isDark, setIsDark] = useState(true)

  // Fixed design system (light/dark, not user-configurable)
  const pageBg = isDark ? "#11131d" : "#f4f6f8"
  const panelBase: CSSProperties = isDark
    ? { backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 32px 80px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)" }
    : { backgroundColor: "#ffffff", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 32px 80px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.12)" }
  const fieldCard: CSSProperties = isDark
    ? { backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.4), 0 16px 48px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.03)" }
    : { backgroundColor: "#ffffff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.10), 0 16px 48px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.08)" }
  const textPrimary = isDark ? "#e1e1ef" : "#111827"
  const textSecondary = isDark ? "#c2c9b5" : "#374151"
  const labelColor = isDark ? "#8b9478" : "#6b7280"
  const bodyColor = isDark ? "#c2c9b5" : "#374151"
  const inputBase: CSSProperties = isDark
    ? { backgroundColor: "#0c0e17", border: "1px solid rgba(255,255,255,0.1)", color: "#e1e1ef", borderRadius: 8, padding: "10px 14px", fontSize: 15, width: "100%", display: "block" }
    : { backgroundColor: "#f9fafb", border: "1px solid rgba(0,0,0,0.12)", color: "#111827", borderRadius: 8, padding: "10px 14px", fontSize: 15, width: "100%", display: "block" }
  const panelStyleFn = (extra?: CSSProperties): CSSProperties => ({ ...panelBase, ...extra })
  const inputOverride: CSSProperties = inputBase

  const [step, setStep] = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const [animDir, setAnimDir] = useState<"fwd" | "bwd">("fwd")
  const [values, setValues] = useState<Record<string, string>>({})
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([])
  const [checkedExtraCosts, setCheckedExtraCosts] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const productsTotal = selectedProducts.reduce((sum, p) => sum + p.price, 0)
  const extraCostsTotal = (cotizador?.extraCosts || [])
    .filter(ec => checkedExtraCosts.includes(ec.label))
    .reduce((sum, ec) => sum + ec.amount, 0)
  const cotizadorTotal = productsTotal + extraCostsTotal

  const handleChange = (id: string, val: string) => setValues(prev => ({ ...prev, [id]: val }))

  const activeStep = steps[step]

  const validateStep = () => {
    const requiredFields = (activeStep?.fields ?? []).filter(f => f.required)
    for (const f of requiredFields) {
      if (f.type === "product_selector") {
        if (!selectedProducts.length) { toast.error(`"${f.label}" es obligatorio`, { description: "Seleccioná al menos un producto para continuar." }); return false }
      } else if (f.type === "checkbox") {
        if (values[f.label] !== "true") { toast.error(`"${f.label}" es obligatorio`); return false }
      } else {
        if (!values[f.label]?.trim()) { toast.error(`"${f.label}" es obligatorio`); return false }
      }
    }
    return true
  }

  const handleNext = () => {
    if (!validateStep()) return
    setAnimDir("fwd"); setAnimKey(k => k + 1); setStep(s => Math.min(s + 1, steps.length - 1))
  }

  const handleBack = () => { setAnimDir("bwd"); setAnimKey(k => k + 1); setStep(s => Math.max(s - 1, 0)) }

  const handleSubmit = async () => {
    if (!validateStep()) return
    setSubmitting(true)
    try {
      const submissionData = {
        ...values,
        ...(selectedProducts.length ? {
          productos_seleccionados: selectedProducts.map(p => p.name).join(", "),
          productos_ids: selectedProducts.map(p => p.id).join(","),
          productos_total: String(cotizadorTotal),
          ...(checkedExtraCosts.length ? { costos_extras: checkedExtraCosts.join(", ") } : {}),
        } : {}),
      }
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_id: form.id, user_id: form.user_id, data: submissionData, conversation_id: conversationId }),
      })
      if (!res.ok) throw new Error()
      setDone(true)
      toast.success("¡Enviado correctamente!")
    } catch {
      toast.error("Error al enviar. Intenta de nuevo.")
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: pageBg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <style>{KEYFRAMES}</style>
        <div className="rounded-2xl text-center w-full" style={{ padding: "32px 24px", maxWidth: 440, ...panelBase }}>
          <span className="material-symbols-outlined" style={{ fontSize: 56, color: color1, fontVariationSettings: "'FILL' 1", display: "block", marginBottom: 14 }}>check_circle</span>
          <h2 className="text-xl font-bold mb-2" style={{ color: textPrimary }}>¡Formulario enviado!</h2>
          <p className="text-sm leading-relaxed" style={{ color: textSecondary }}>
            Gracias por completar el formulario. Nos pondremos en contacto contigo pronto.
          </p>
        </div>
      </div>
    )
  }

  const isLast = step === steps.length - 1
  const stepAnim = animDir === "fwd"
    ? "stepEnterRight 0.3s cubic-bezier(0.22,1,0.36,1)"
    : "stepEnterLeft 0.3s cubic-bezier(0.22,1,0.36,1)"

  const visibleFields = (activeStep?.fields ?? []).filter(field => {
    const cond = field.conditional
    if (!cond?.fieldLabel || !cond.values?.length) return true
    const depValue = values[cond.fieldLabel] ?? ""
    return cond.values.includes(depValue)
  })
  const showCotizador = hasCotizador

  // Mini cotizador bar shown on mobile when products are selected
  const showMiniBar = hasCotizador && selectedProducts.length > 0

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start lg:justify-center py-4 px-3 sm:py-6 sm:px-4 md:px-6"
      style={{ backgroundColor: pageBg, fontFamily: "'Plus Jakarta Sans', sans-serif", color: bodyColor }}
    >
      <style>{KEYFRAMES}</style>

      {/* Mobile cotizador bar — fixed at bottom, only when products selected */}
      {showMiniBar && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 lg:hidden"
          style={{ background: themeGradient, boxShadow: "0 -4px 24px rgba(0,0,0,0.15)" }}
        >
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: onGradientDim }}>Cotización</p>
            <p className="text-lg font-black leading-tight" style={{ color: onGradient }}>${cotizadorTotal.toLocaleString("es-AR")}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(0,0,0,0.15)", color: onGradient }}>
              {selectedProducts.length} producto{selectedProducts.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      <div className={`w-full max-w-5xl relative z-10 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12 ${showMiniBar ? "pb-16 lg:pb-0" : ""}`}>

        <div className="flex flex-col gap-3 sm:gap-4 lg:col-span-8">

          {/* Header */}
          <header className="rounded-2xl p-4 sm:p-5" style={panelStyleFn()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2 leading-tight" style={{ color: textPrimary }}>
                  {logo && <img src={logo} alt="Logo" style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />}
                  <span className="truncate">{form.name}</span>
                </h1>
                {form.description && <p className="text-xs sm:text-sm mt-1 leading-relaxed" style={{ color: textSecondary }}>{form.description}</p>}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setIsDark(d => !d)}
                  style={{ width: 34, height: 34, borderRadius: "50%", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`, background: isDark ? "rgba(255,255,255,0.06)" : "#f3f4f6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 17, color: isDark ? "#c2c9b5" : "#6b7280", fontVariationSettings: "'FILL' 1" }}>
                    {isDark ? "light_mode" : "dark_mode"}
                  </span>
                </button>
              </div>
            </div>

            {steps.length > 1 && (
              <div className="flex flex-wrap items-center gap-1 mt-3 pt-3" style={{ borderTop: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)" }}>
                {steps.map((s, i) => {
                  const isActive = i === step
                  const isDone = i < step
                  return (
                    <div key={s.id} className="flex items-center gap-1">
                      <div
                        key={isActive ? `dot-${animKey}` : `dot-${i}`}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                        style={{
                          ...(isActive || isDone
                            ? { background: themeGradient, color: onGradient }
                            : { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#f3f4f6", border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)", color: isDark ? "#6b7280" : "#9ca3af" }),
                          transition: "transform 0.3s ease",
                          transform: isActive ? "scale(1.1)" : "scale(1)",
                          animation: isActive ? "dotPop 0.4s cubic-bezier(0.22,1,0.36,1)" : "none",
                        }}
                      >
                        {isDone
                          ? <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: "'FILL' 1" }}>check</span>
                          : i + 1}
                      </div>
                      {i < steps.length - 1 && (
                        <div className="h-0.5 w-4 rounded-full" style={{ background: isDone ? themeGradient : (isDark ? "rgba(255,255,255,0.1)" : "#e5e7eb"), transition: "background 0.4s ease" }} />
                      )}
                    </div>
                  )
                })}
                <span className="text-xs ml-1" style={{ color: labelColor }}>{step + 1} de {steps.length}</span>
              </div>
            )}
          </header>

          {/* Active step */}
          {activeStep && (
            <section key={animKey} className="rounded-2xl p-4 sm:p-6 flex flex-col gap-4" style={panelStyleFn({ animation: stepAnim })}>
              <div className="pb-3" style={{ borderBottom: isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.07)" }}>
                <h2 className="text-base sm:text-xl font-semibold" style={{ color: textPrimary }}>{activeStep.title}</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {visibleFields.map((field, fi) => {
                  const isProductSelector = field.type === "product_selector"
                  const isWide = isProductSelector || field.type === "radio" || field.type === "checkbox" || field.type === "textarea"
                  return (
                    <div key={field.id ?? fi} className={`flex flex-col gap-2 p-3 sm:p-4${isWide ? " sm:col-span-2" : ""}`} style={fieldCard}>
                      {!isProductSelector && (
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs font-semibold" style={{ color: labelColor }}>
                            {field.label}
                            {field.required && <span className="ml-0.5" style={{ color: color1 }}>*</span>}
                          </label>
                          {field.link_url && (
                            <a
                              href={field.link_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                              style={{ backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)", color: isDark ? "#ffffff" : "#000000", textDecoration: "none", border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.12)" }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>open_in_new</span>
                              {field.link_label || "Ver más"}
                            </a>
                          )}
                        </div>
                      )}
                      {isProductSelector ? (
                        <ProductSelector
                          field={field}
                          userId={form.user_id}
                          selectedProducts={selectedProducts}
                          onToggle={(p) => {
                            setSelectedProducts(prev => {
                              const exists = prev.find(sp => sp.id === p.id)
                              return exists ? prev.filter(sp => sp.id !== p.id) : [...prev, p]
                            })
                          }}
                          accentColor={color1}
                          labelColor={labelColor}
                          bodyColor={bodyColor}
                          isDark={isDark}
                        />
                      ) : (
                        <FieldInput field={field} value={values[field.label] ?? ""} onChange={handleChange} accentColor={color1} inputOverride={inputOverride} />
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between pt-1">
                {step > 0 ? (
                  <button onClick={handleBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#f3f4f6", color: bodyColor, border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)", cursor: "pointer" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back</span>
                    Atrás
                  </button>
                ) : <div />}

                {isLast ? (
                  <button onClick={handleSubmit} disabled={submitting} className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg transition-all" style={{ background: themeGradient, color: onGradient, border: "none", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? "Enviando..." : "Enviar formulario"}
                    {!submitting && <span className="material-symbols-outlined" style={{ fontSize: 17 }}>send</span>}
                  </button>
                ) : (
                  <button onClick={handleNext} className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg transition-all" style={{ background: themeGradient, color: onGradient, border: "none", cursor: "pointer" }}>
                    Continuar
                    <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_forward</span>
                  </button>
                )}
              </div>
            </section>
          )}

        </div>

        {/* Right sidebar — always visible on desktop */}
        <div className="hidden lg:flex lg:col-span-4 flex-col gap-4">
          {showCotizador && (
            <CotizadorSidebar
              cotizador={cotizador}
              selectedProducts={selectedProducts}
              checkedExtraCosts={checkedExtraCosts}
              onToggleExtraCost={(label) => setCheckedExtraCosts(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])}
              cotizadorTotal={cotizadorTotal}
              themeGradient={themeGradient}
              color1={color1}
              color2={color2}
              onGradient={onGradient}
              onGradientDim={onGradientDim}
              panelBase={panelBase}
              textPrimary={textPrimary}
              bodyColor={bodyColor}
              isDark={isDark}
              showPayment={showPayment}
              values={values}
              onChangeValue={handleChange}
              inputOverride={inputOverride}
              labelColor={labelColor}
            />
          )}

          {/* Seguro + branding — siempre al final del sidebar */}
          <div className="rounded-xl p-3 sm:p-4 flex items-start gap-3" style={{ ...panelBase, borderLeft: `3px solid ${color2}`, boxShadow: isDark ? (panelBase.boxShadow as string) : "0 4px 16px rgba(0,0,0,0.10), 0 16px 48px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.08)" }}>
            <span style={{ fontFamily: "'Material Symbols Outlined'", fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24", fontSize: 18, color: color2, lineHeight: 1, display: "inline-block", userSelect: "none" as const, flexShrink: 0, marginTop: 2 }}>verified_user</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: textPrimary }}>Seguro y confiable</p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: bodyColor }}>Tus datos están protegidos. Al completar recibirás una confirmación por WhatsApp.</p>
            </div>
          </div>
          <a href="https://codeadesarrollos.com" target="_blank" rel="noopener noreferrer" style={{ display: "flex", flexDirection: "column", alignItems: "center", textDecoration: "none", lineHeight: 1, gap: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.25em", textTransform: "uppercase" as const, color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.3)" }}>powered by</span>
            <span style={{ fontSize: "clamp(40px, 7vw, 72px)", fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase" as const, lineHeight: 1, color: isDark ? "#ffffff" : "#000000", textShadow: isDark ? "none" : "0 4px 6px rgba(0,0,0,0.25), 0 10px 40px rgba(0,0,0,0.20), 0 2px 2px rgba(0,0,0,0.15)" }}>CODEA</span>
          </a>
        </div>
      </div>

      {/* Mobile full cotizador — shown below form when products selected */}
      {showCotizador && selectedProducts.length > 0 && (
        <div className="w-full max-w-5xl mt-3 lg:hidden">
          <CotizadorSidebar
            cotizador={cotizador}
            selectedProducts={selectedProducts}
            checkedExtraCosts={checkedExtraCosts}
            onToggleExtraCost={(label) => setCheckedExtraCosts(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])}
            cotizadorTotal={cotizadorTotal}
            themeGradient={themeGradient}
            color1={color1}
            color2={color2}
            onGradient={onGradient}
            onGradientDim={onGradientDim}
            panelBase={panelBase}
            textPrimary={textPrimary}
            bodyColor={bodyColor}
            isDark={isDark}
          />
        </div>
      )}
    </div>
  )
}

// ---- Cotizador sidebar (shared between desktop and mobile) ----
function CotizadorSidebar({
  cotizador, selectedProducts, checkedExtraCosts, onToggleExtraCost,
  cotizadorTotal, themeGradient, color1, color2, onGradient, onGradientDim,
  panelBase, textPrimary, bodyColor, isDark,
  showPayment, values, onChangeValue, inputOverride, labelColor,
}: {
  cotizador: CotizadorConfig | undefined
  selectedProducts: Product[]
  checkedExtraCosts: string[]
  onToggleExtraCost: (label: string) => void
  cotizadorTotal: number
  themeGradient: string
  color1: string
  color2: string
  onGradient: string
  onGradientDim: string
  panelBase: CSSProperties
  textPrimary: string
  bodyColor: string
  isDark: boolean
  showPayment: boolean
  values: Record<string, string>
  onChangeValue: (key: string, val: string) => void
  inputOverride: CSSProperties
  labelColor: string
}) {
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="rounded-2xl p-4 sm:p-6 flex flex-col gap-4 relative overflow-hidden" style={{ background: themeGradient, boxShadow: `0 8px 32px ${color1}1a` }}>
        <div className="absolute rounded-full pointer-events-none" style={{ top: 0, right: 0, width: 100, height: 100, backgroundColor: "rgba(255,255,255,0.1)", transform: "translate(50%,-50%)", filter: "blur(20px)" }} />
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: onGradientDim }}>Cotización estimada</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="font-bold" style={{ fontSize: "clamp(30px, 5vw, 44px)", color: onGradient, lineHeight: 1.1 }}>
              ${cotizadorTotal.toLocaleString("es-AR")}
            </span>
          </div>
        </div>
        <div className="rounded-xl p-3 flex flex-col gap-2 border border-white/10" style={{ backgroundColor: "rgba(17,19,28,0.2)", backdropFilter: "blur(8px)" }}>
          {selectedProducts.length === 0 ? (
            <p className="text-xs text-center opacity-60" style={{ color: onGradient }}>Seleccioná un producto para ver el precio</p>
          ) : (
            selectedProducts.map(p => (
              <div key={p.id} className="flex justify-between items-center gap-2">
                <span className="text-xs truncate" style={{ color: onGradient }}>{p.name}</span>
                <span className="text-xs font-bold flex-shrink-0" style={{ color: onGradient }}>${p.price.toLocaleString("es-AR")}</span>
              </div>
            ))
          )}
          {cotizador?.extraCosts && cotizador.extraCosts.length > 0 && (
            <>
              <div className="h-px my-1" style={{ backgroundColor: "rgba(255,255,255,0.15)" }} />
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: onGradientDim }}>Costos extras</p>
              {cotizador.extraCosts.map(ec => {
                const checked = checkedExtraCosts.includes(ec.label)
                return (
                  <label key={ec.label} className="flex items-center justify-between gap-2 cursor-pointer">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        onClick={() => onToggleExtraCost(ec.label)}
                        style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: "pointer", border: `2px solid ${checked ? onGradient : "rgba(255,255,255,0.4)"}`, background: checked ? onGradient : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        {checked && <span className="material-symbols-outlined" style={{ fontSize: 11, color: color1, fontVariationSettings: "'FILL' 1" }}>check</span>}
                      </div>
                      <span className="text-xs truncate" style={{ color: onGradient }}>{ec.label}</span>
                    </div>
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: onGradient }}>+${ec.amount.toLocaleString("es-AR")}</span>
                  </label>
                )
              })}
            </>
          )}
          <div className="h-px my-1" style={{ backgroundColor: "rgba(0,0,0,0.2)" }} />
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold" style={{ color: onGradient }}>Total</span>
            <span className="text-sm font-bold" style={{ color: onGradient }}>${cotizadorTotal.toLocaleString("es-AR")}</span>
          </div>
        </div>
      </div>

      {showPayment && (
        <div className="rounded-2xl p-4 sm:p-5 flex flex-col gap-3" style={panelBase}>
          <div className="flex items-center gap-2.5 pb-3" style={{ borderBottom: isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.07)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: color1, fontVariationSettings: "'FILL' 1" }}>credit_card</span>
            <p className="text-sm font-semibold" style={{ color: textPrimary }}>Datos de pago</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { key: "__card_name", label: "Titular", placeholder: "Juan García", type: "text", wide: true },
              { key: "__card_number", label: "Número de tarjeta", placeholder: "1234 5678 9012 3456", type: "text", wide: true },
              { key: "__card_expiry", label: "Vencimiento", placeholder: "MM/AA", type: "text", wide: false },
              { key: "__card_cvv", label: "CVV", placeholder: "123", type: "text", wide: false },
            ].map(({ key, label, placeholder, type, wide }) => (
              <div key={key} className={`flex flex-col gap-1.5${wide ? " col-span-2" : ""}`}>
                <label className="text-xs font-medium" style={{ color: labelColor }}>{label}</label>
                <input type={type} placeholder={placeholder} value={values[key] ?? ""} onChange={e => onChangeValue(key, e.target.value)} style={{ ...inputOverride }} />
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

// ---- Product selector ----
const PAGE_SIZE = 5

function ProductSelector({
  field, userId, selectedProducts, onToggle,
  accentColor, labelColor, bodyColor, isDark,
}: {
  field: FormField
  userId: string
  selectedProducts: Product[]
  onToggle: (p: Product) => void
  accentColor: string
  labelColor: string
  bodyColor: string
  isDark: boolean
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const hasSpecificIds = !!(field.product_ids?.length)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({ user_id: userId })
    if (hasSpecificIds) {
      params.set("ids", field.product_ids!.join(","))
    } else {
      params.set("limit", String(PAGE_SIZE))
      params.set("offset", "0")
      if (field.product_category) params.set("category", field.product_category)
    }
    fetch(`/api/forms/products?${params}`)
      .then(r => r.json())
      .then(({ products: p, total: t }) => {
        if (!cancelled) { setProducts(p || []); setTotal(t || 0) }
      })
      .catch(() => { if (!cancelled) setProducts([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, field.product_category, field.product_ids?.join(",")])

  const loadMore = () => {
    if (loadingMore || products.length >= total || hasSpecificIds) return
    setLoadingMore(true)
    const params = new URLSearchParams({ user_id: userId, limit: String(PAGE_SIZE), offset: String(products.length) })
    if (field.product_category) params.set("category", field.product_category)
    fetch(`/api/forms/products?${params}`)
      .then(r => r.json())
      .then(({ products: more }) => setProducts(prev => [...prev, ...(more || [])]))
      .finally(() => setLoadingMore(false))
  }

  useEffect(() => {
    if (!sentinelRef.current || hasSpecificIds) return
    const obs = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMore() }, { threshold: 0.1 })
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [products.length, total, loadingMore])

  const defaultBorder = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)"
  const defaultCardBg = isDark ? "#16182a" : "#ffffff"

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium" style={{ color: labelColor }}>{field.label}</label>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-[20px] animate-pulse" style={{ aspectRatio: "3/4", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />
          ))}
        </div>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="rounded-2xl p-4 text-center text-sm" style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", border: `1px solid ${defaultBorder}`, color: bodyColor, opacity: 0.6 }}>
        No hay productos disponibles
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold" style={{ color: labelColor }}>
          {field.label}
          {field.required && <span className="ml-0.5" style={{ color: accentColor }}>*</span>}
        </label>
        {selectedProducts.length > 0 && (
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{ background: `${accentColor}20`, color: accentColor }}>
            {selectedProducts.length} seleccionado{selectedProducts.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {products.map(product => {
          const isSelected = selectedProducts.some(sp => sp.id === product.id)
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onToggle(product)}
              style={{ textAlign: "left", padding: 0, background: "none", border: "none", cursor: "pointer", borderRadius: 20, width: "100%", outline: "none" }}
            >
              <div style={{
                borderRadius: 20,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                background: isSelected ? (isDark ? `${accentColor}12` : `${accentColor}08`) : defaultCardBg,
                border: `${isSelected ? "2px" : "1px"} solid ${isSelected ? accentColor : defaultBorder}`,
                boxShadow: isSelected
                  ? `0 0 0 3px ${accentColor}18, 0 6px 24px ${accentColor}20`
                  : isDark ? "none" : "0 1px 6px rgba(0,0,0,0.06)",
                transition: "all 0.2s ease",
                transform: isSelected ? "translateY(-1px)" : "none",
              }}>

                {/* Top area: image or styled placeholder */}
                <div style={{ position: "relative", width: "100%", paddingBottom: "65%" }}>
                  <div style={{ position: "absolute", inset: 0 }}>
                    {product.image_url ? (
                      <>
                        <img
                          src={product.image_url}
                          alt={product.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                        {/* Bottom gradient so price text is readable */}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "55%", background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)" }} />
                        {/* Price over image */}
                        <div style={{ position: "absolute", bottom: 8, left: 10 }}>
                          <span style={{ fontSize: 15, fontWeight: 900, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.4)", letterSpacing: "-0.02em" }}>
                            ${product.price.toLocaleString("es-AR")}
                          </span>
                        </div>
                      </>
                    ) : (
                      /* Placeholder: gradient bg + big initial */
                      <div style={{
                        width: "100%", height: "100%",
                        background: isSelected
                          ? `linear-gradient(135deg, ${accentColor}35 0%, ${accentColor}12 100%)`
                          : isDark ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #f0f2f5 0%, #e8eaed 100%)",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                      }}>
                        <span style={{
                          fontSize: 34, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em",
                          color: isSelected ? accentColor : (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)"),
                          userSelect: "none",
                        }}>
                          {product.name.charAt(0).toUpperCase()}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.02em", color: isSelected ? accentColor : (isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)") }}>
                          ${product.price.toLocaleString("es-AR")}
                        </span>
                      </div>
                    )}

                    {/* Check badge */}
                    {isSelected && (
                      <div style={{
                        position: "absolute", top: 8, right: 8,
                        width: 24, height: 24, borderRadius: "50%",
                        background: accentColor,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: `0 2px 8px ${accentColor}55`,
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#fff", fontVariationSettings: "'FILL' 1", lineHeight: 1 }}>check</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Info bottom */}
                <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, lineHeight: 1.35,
                    color: isSelected ? accentColor : (isDark ? "#e1e1ef" : "#111827"),
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden",
                  }}>
                    {product.name}
                  </span>
                  {product.description && (
                    <p style={{
                      fontSize: 11, lineHeight: 1.4, margin: 0,
                      color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden",
                    }}>
                      {product.description}
                    </p>
                  )}
                  {/* Show price in info only when no image (image shows it overlaid) */}
                  {!product.image_url && null}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {!hasSpecificIds && products.length < total && (
        <div ref={sentinelRef} className="flex justify-center py-2">
          {loadingMore && (
            <div className="flex items-center gap-2 text-xs" style={{ color: labelColor }}>
              <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: `${accentColor} transparent transparent transparent` }} />
              Cargando más...
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Field renderer ----
function FieldInput({ field, value, onChange, accentColor, inputOverride }: {
  field: FormField; value: string
  onChange: (id: string, val: string) => void
  accentColor: string
  inputOverride: CSSProperties
}) {
  const key = field.label
  const opts = normalizeOptions(field.options)
  const baseStyle: CSSProperties = { borderRadius: 8, padding: "10px 14px", fontSize: 15, width: "100%", display: "block", ...inputOverride }

  if (field.type === "select") {
    return (
      <select className="input-field" style={baseStyle} value={value} onChange={e => onChange(key, e.target.value)}>
        <option value="">Seleccionar...</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }

  if (field.type === "radio") {
    return (
      <div className="flex flex-col gap-2">
        {opts.map(o => {
          const isSelected = value === o.value
          return (
            <label
              key={o.value}
              className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5"
              style={{
                backgroundColor: isSelected ? `${accentColor}14` : inputOverride.backgroundColor,
                border: isSelected ? `1.5px solid ${accentColor}` : inputOverride.border,
                color: inputOverride.color || "#374151",
                transition: "border-color 0.15s ease, background-color 0.15s ease",
              }}
              onClick={() => onChange(key, o.value)}
            >
              <div style={{
                width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                border: isSelected ? `2px solid ${accentColor}` : `2px solid rgba(150,150,150,0.4)`,
                background: isSelected ? accentColor : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s ease",
              }}>
                {isSelected && <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#fff" }} />}
              </div>
              <span className="text-sm font-medium">{o.label}</span>
            </label>
          )
        })}
      </div>
    )
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 cursor-pointer text-sm mt-1" style={{ color: inputOverride.color || "#374151" }}>
        <input type="checkbox" className="custom-checkbox" checked={value === "true"} onChange={e => onChange(key, e.target.checked ? "true" : "false")} />
        {field.placeholder ?? field.label}
      </label>
    )
  }

  if (field.type === "textarea") {
    return <textarea className="input-field" style={{ ...baseStyle, minHeight: 90, resize: "vertical" }} placeholder={field.placeholder} value={value} onChange={e => onChange(key, e.target.value)} rows={3} />
  }

  const htmlType = field.type === "phone" ? "tel" : field.type
  return <input type={htmlType} className="input-field" style={baseStyle} placeholder={field.placeholder} value={value} onChange={e => onChange(key, e.target.value)} />
}
