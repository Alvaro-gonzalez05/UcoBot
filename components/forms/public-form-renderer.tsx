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
  conditional?: { fieldLabel: string; value: string }
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
  // legacy
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

// ---- Theme helpers ----
function getPanelStyle(theme: FormTheme | undefined, isDark: boolean): CSSProperties {
  const type = theme?.panelBgType || "default"
  const border = theme?.panelBorder ? { border: `1px solid ${theme.panelBorder}` } : {}
  if (type === "solid") return { backgroundColor: theme?.panelBg || "#1e202c", ...border }
  if (type === "gradient") return { background: `linear-gradient(135deg, ${theme?.panelBgFrom || "#1e202c"} 0%, ${theme?.panelBgTo || "#0c0e17"} 100%)`, ...border }
  return { ...(isDark ? {} : { backgroundColor: "rgb(30,32,44)" }), ...border }
}

function getTitleStyle(theme: FormTheme | undefined): CSSProperties {
  if (theme?.titleType === "gradient" && theme?.titleFrom && theme?.titleTo) {
    return {
      background: `linear-gradient(135deg, ${theme.titleFrom} 0%, ${theme.titleTo} 100%)`,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      display: "inline-block",
    }
  }
  return { color: theme?.titleColor || "#ffffff" }
}

function getInputOverride(theme: FormTheme | undefined): CSSProperties {
  const s: CSSProperties = {}
  if (theme?.inputBg) s.backgroundColor = theme.inputBg
  if (theme?.inputBorder) s.borderColor = theme.inputBorder
  if (theme?.inputText) s.color = theme.inputText
  return s
}

const KEYFRAMES = `
  @keyframes stepEnterRight { from{opacity:0;transform:translateX(28px)} to{opacity:1;transform:translateX(0)} }
  @keyframes stepEnterLeft  { from{opacity:0;transform:translateX(-28px)} to{opacity:1;transform:translateX(0)} }
  @keyframes dotPop { 0%{transform:scale(1)} 45%{transform:scale(1.38)} 70%{transform:scale(0.9)} 100%{transform:scale(1)} }
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

  const bodyColor  = theme?.bodyColor  || "#e1e1ef"
  const labelColor = theme?.labelColor || "#c2c9b5"
  const titleStyle = getTitleStyle(theme)
  const panelStyleFn = (extra?: CSSProperties) => ({ ...getPanelStyle(theme, isDark), ...extra })
  const inputOverride = getInputOverride(theme)

  const [isDark, setIsDark] = useState(true)
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
        body: JSON.stringify({
          form_id: form.id,
          user_id: form.user_id,
          data: submissionData,
          conversation_id: conversationId,
        }),
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

  const toggleBtn = (
    <button
      onClick={() => setIsDark(d => !d)}
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      style={{
        position: "fixed", top: 18, right: 18, zIndex: 100,
        width: 40, height: 40, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        border: isDark ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(0,0,0,0.18)",
        backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
        cursor: "pointer",
        transition: "background-color 0.3s ease, border-color 0.3s ease",
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 19, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)", display: "block", lineHeight: "1" }}>
        {isDark ? "light_mode" : "dark_mode"}
      </span>
    </button>
  )

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: isDark ? "#000" : "#fff", fontFamily: "'Plus Jakarta Sans', sans-serif", transition: "background-color 0.3s ease" }}>
        <style>{KEYFRAMES}</style>
        {toggleBtn}
        <div className="glass-panel rounded-2xl text-center" style={{ padding: 40, maxWidth: 480, ...getPanelStyle(theme, isDark) }}>
          <span className="material-symbols-outlined" style={{ fontSize: 64, color: color1, fontVariationSettings: "'FILL' 1", display: "block", marginBottom: 16 }}>check_circle</span>
          <h2 className="text-2xl font-bold mb-2" style={titleStyle}>¡Formulario enviado!</h2>
          <p className="text-sm leading-relaxed" style={{ color: bodyColor }}>
            Gracias por completar el formulario. Nos pondremos en contacto contigo pronto.
          </p>
        </div>
      </div>
    )
  }

  const activeStep = steps[step]
  const isLast = step === steps.length - 1
  const stepAnim = animDir === "fwd"
    ? "stepEnterRight 0.32s cubic-bezier(0.22,1,0.36,1)"
    : "stepEnterLeft 0.32s cubic-bezier(0.22,1,0.36,1)"
  const pageBg = isDark ? "#000000" : "#ffffff"

  const visibleFields = activeStep?.fields ?? []

  const showCotizador = hasCotizador && selectedProducts.length > 0

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 md:p-8 relative overflow-x-hidden"
      style={{ backgroundColor: pageBg, fontFamily: "'Plus Jakarta Sans', sans-serif", color: bodyColor, transition: "background-color 0.3s ease" }}
    >
      <style>{KEYFRAMES}</style>
      {toggleBtn}

      {/* Background blobs */}
      <div className="absolute rounded-full pointer-events-none" style={{ top: "-10%", left: "-10%", width: "40%", height: "40%", background: "rgba(180,245,119,0.05)", filter: "blur(120px)", zIndex: 0 }} />
      <div className="absolute rounded-full pointer-events-none" style={{ bottom: "-10%", right: "-10%", width: "50%", height: "50%", background: "rgba(0,198,182,0.10)", filter: "blur(150px)", zIndex: 0 }} />

      <div className={`w-full max-w-5xl relative z-10 grid grid-cols-1 gap-4 ${showCotizador ? "lg:grid-cols-12" : ""}`}>

        <div className={`flex flex-col gap-4 ${showCotizador ? "lg:col-span-8" : ""}`}>

          {/* Header */}
          <header className="glass-panel rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4" style={panelStyleFn()}>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" style={titleStyle}>
                {logo && <img src={logo} alt="Logo" style={{ width: 34, height: 34, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />}
                {form.name}
              </h1>
              {form.description && <p className="text-sm mt-1" style={{ color: bodyColor }}>{form.description}</p>}
            </div>

            {steps.length > 1 && (
              <div className="flex items-center gap-1">
                {steps.map((s, i) => {
                  const isActive = i === step
                  const isDone = i < step
                  return (
                    <div key={s.id} className="flex items-center gap-1">
                      <div
                        key={isActive ? `dot-${animKey}` : `dot-${i}`}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                        style={{
                          ...(isActive || isDone
                            ? { background: themeGradient, color: onGradient }
                            : { backgroundColor: "#282933", border: "1px solid #424939", color: "#c2c9b5" }),
                          transition: "transform 0.3s ease",
                          transform: isActive ? "scale(1.12)" : "scale(1)",
                          animation: isActive ? "dotPop 0.4s cubic-bezier(0.22,1,0.36,1)" : "none",
                        }}
                      >
                        {isDone
                          ? <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>check</span>
                          : i + 1}
                      </div>
                      {i < steps.length - 1 && (
                        <div className="h-1 w-5 rounded-full" style={{ background: isDone ? themeGradient : "#282933", transition: "background 0.4s ease" }} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </header>

          {/* Active step */}
          {activeStep && (
            <section key={animKey} className="glass-panel rounded-2xl p-6 flex flex-col gap-4" style={panelStyleFn({ animation: stepAnim })}>
              <div className="flex items-center gap-3 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <h2 className="text-xl font-semibold" style={titleStyle}>{activeStep.title}</h2>
              </div>

              <div className="flex flex-col gap-4 mt-2">
                {visibleFields.map((field, fi) => {
                  const isProductSelector = field.type === "product_selector"
                  return (
                    <div key={field.id ?? fi} className={`flex flex-col gap-1.5 ${!isProductSelector && (field.fullWidth || field.type === "textarea") ? "" : ""}`}>
                      {!isProductSelector && (
                        <label className="input-label text-xs font-medium" style={{ color: labelColor }}>
                          {field.label}
                          {field.required && <span className="ml-0.5" style={{ color: color1 }}>*</span>}
                        </label>
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
                          accentColor2={color2}
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

              <div className="flex items-center justify-between pt-2">
                {step > 0 ? (
                  <button onClick={handleBack} className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium transition-all" style={{ backgroundColor: "#282933", color: "#c2c9b5", border: "1px solid #424939", cursor: "pointer" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                    Atrás
                  </button>
                ) : <div />}

                {isLast ? (
                  <button onClick={handleSubmit} disabled={submitting} className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold shadow-lg transition-all" style={{ background: themeGradient, color: onGradient, border: "none", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? "Enviando..." : "Enviar formulario"}
                    {!submitting && <span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span>}
                  </button>
                ) : (
                  <button onClick={handleNext} className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold shadow-lg transition-all" style={{ background: themeGradient, color: onGradient, border: "none", cursor: "pointer" }}>
                    Continuar
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Payment form (shown when cotizador + showPayment + product selected) */}
          {showCotizador && showPayment && (
            <section className="glass-panel rounded-2xl p-6 flex flex-col gap-4" style={panelStyleFn()}>
              <div className="flex items-center gap-3 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: color1, fontVariationSettings: "'FILL' 1" }}>credit_card</span>
                <h2 className="text-lg font-semibold" style={titleStyle}>Datos de pago</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: "__card_name", label: "Titular de la tarjeta", placeholder: "Juan García", type: "text" },
                  { key: "__card_number", label: "Número de tarjeta", placeholder: "1234 5678 9012 3456", type: "text" },
                  { key: "__card_expiry", label: "Vencimiento", placeholder: "MM/AA", type: "text" },
                  { key: "__card_cvv", label: "CVV", placeholder: "123", type: "text" },
                ].map(({ key, label, placeholder, type }) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium" style={{ color: labelColor }}>{label}</label>
                    <input
                      type={type}
                      placeholder={placeholder}
                      value={values[key] ?? ""}
                      onChange={e => handleChange(key, e.target.value)}
                      className="input-field"
                      style={{ borderRadius: 8, padding: "10px 16px", fontSize: 15, width: "100%", display: "block", ...inputOverride }}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Cotizador panel */}
        {showCotizador && (
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden" style={{ background: themeGradient, boxShadow: `0 8px 32px ${color1}1a` }}>
              <div className="absolute rounded-full" style={{ top: 0, right: 0, width: 128, height: 128, backgroundColor: "rgba(255,255,255,0.1)", transform: "translate(50%,-50%)", filter: "blur(24px)" }} />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: onGradientDim }}>Cotización estimada</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="font-bold" style={{ fontSize: 44, color: onGradient, lineHeight: 1.1 }}>
                    ${cotizadorTotal.toLocaleString("es-AR")}
                  </span>
                </div>
              </div>
              <div className="rounded-xl p-3 flex flex-col gap-2 border border-white/10" style={{ backgroundColor: "rgba(17,19,28,0.2)", backdropFilter: "blur(8px)" }}>
                {selectedProducts.map(p => (
                  <div key={p.id} className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: onGradient }}>{p.name}</span>
                    <span className="text-xs font-bold" style={{ color: onGradient }}>${p.price.toLocaleString("es-AR")}</span>
                  </div>
                ))}
                {cotizador?.extraCosts && cotizador.extraCosts.length > 0 && (
                  <>
                    <div className="h-px my-1" style={{ backgroundColor: "rgba(255,255,255,0.15)" }} />
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: onGradientDim }}>Costos extras</p>
                    {cotizador.extraCosts.map(ec => {
                      const checked = checkedExtraCosts.includes(ec.label)
                      return (
                        <label key={ec.label} className="flex items-center justify-between gap-2 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <div
                              onClick={() => setCheckedExtraCosts(prev => checked ? prev.filter(l => l !== ec.label) : [...prev, ec.label])}
                              style={{
                                width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: "pointer",
                                border: `2px solid ${checked ? onGradient : "rgba(255,255,255,0.4)"}`,
                                background: checked ? onGradient : "transparent",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}
                            >
                              {checked && <span className="material-symbols-outlined" style={{ fontSize: 11, color: color1, fontVariationSettings: "'FILL' 1" }}>check</span>}
                            </div>
                            <span className="text-xs" style={{ color: onGradient }}>{ec.label}</span>
                          </div>
                          <span className="text-xs font-bold" style={{ color: onGradient }}>+${ec.amount.toLocaleString("es-AR")}</span>
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

            <div className="glass-panel rounded-xl p-4 flex items-start gap-3" style={{ ...getPanelStyle(theme, isDark), borderLeft: `2px solid ${color2}` }}>
              <span style={{ fontFamily: "'Material Symbols Outlined'", fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24", fontSize: 20, color: color2, lineHeight: 1, display: "inline-block", userSelect: "none", flexShrink: 0, marginTop: 2 }}>verified_user</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: theme?.titleColor || "#ffffff" }}>Seguro y confiable</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: bodyColor }}>
                  Tus datos están protegidos. Al completar recibirás una confirmación por WhatsApp.
                </p>
              </div>
            </div>

            <a
              href="https://codeadesarrollos.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", textDecoration: "none", lineHeight: 1, gap: 4 }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.25em", textTransform: "uppercase", color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.3)" }}>powered by</span>
              <span style={{ fontSize: "clamp(48px, 8vw, 80px)", fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 1, color: isDark ? "#ffffff" : "#000000" }}>CODEA</span>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Product selector ----
const PAGE_SIZE = 5

function ProductSelector({
  field, userId, selectedProducts, onToggle,
  accentColor, accentColor2, labelColor, bodyColor, isDark,
}: {
  field: FormField
  userId: string
  selectedProducts: Product[]
  onToggle: (p: Product) => void
  accentColor: string
  accentColor2: string
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

  const cardBg = (sel: boolean) => sel
    ? (isDark ? `${accentColor}1a` : `${accentColor}18`)
    : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)")
  const cardBorder = (sel: boolean) => `1.5px solid ${sel ? accentColor : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)")}`

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium" style={{ color: labelColor }}>{field.label}</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-2xl animate-pulse" style={{ height: 180, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />
          ))}
        </div>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="rounded-xl p-4 text-center text-sm" style={{ background: cardBg(false), border: cardBorder(false), color: bodyColor, opacity: 0.6 }}>
        No hay productos disponibles
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium" style={{ color: labelColor }}>
          {field.label}
          {field.required && <span className="ml-0.5" style={{ color: accentColor }}>*</span>}
        </label>
        {selectedProducts.length > 0 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${accentColor}22`, color: accentColor }}>
            {selectedProducts.length} seleccionado{selectedProducts.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {products.map(product => {
          const isSelected = selectedProducts.some(sp => sp.id === product.id)
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onToggle(product)}
              style={{
                textAlign: "left", padding: 0, background: "none", border: "none",
                cursor: "pointer", borderRadius: 18, width: "100%", outline: "none",
                transition: "transform 0.15s ease",
                transform: isSelected ? "scale(1.02)" : "scale(1)",
              }}
            >
              <div className="rounded-[18px] overflow-hidden flex flex-col h-full" style={{
                background: cardBg(isSelected),
                border: cardBorder(isSelected),
                boxShadow: isSelected ? `0 4px 20px ${accentColor}28` : "none",
                transition: "all 0.2s ease",
              }}>
                {product.image_url ? (
                  <div style={{ width: "100%", height: 130, overflow: "hidden", flexShrink: 0, position: "relative" }}>
                    <img src={product.image_url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {isSelected && (
                      <div style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: "50%", background: accentColor, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 2px 8px ${accentColor}60` }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: isDark ? "#000" : "#fff", fontVariationSettings: "'FILL' 1", lineHeight: 1 }}>check</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ width: "100%", height: 64, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, opacity: 0.2, color: isDark ? "#fff" : "#000" }}>inventory_2</span>
                    {isSelected && (
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: accentColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13, color: isDark ? "#000" : "#fff", fontVariationSettings: "'FILL' 1", lineHeight: 1 }}>check</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex flex-col gap-1" style={{ padding: "10px 12px 12px" }}>
                  <span className="text-sm font-bold leading-tight" style={{ color: isSelected ? accentColor : (isDark ? "#e1e1ef" : "#1a1a2e") }}>
                    {product.name}
                  </span>
                  {product.description && (
                    <p className="text-xs leading-snug line-clamp-2" style={{ color: isDark ? "rgba(193,201,181,0.75)" : "rgba(0,0,0,0.45)" }}>
                      {product.description}
                    </p>
                  )}
                  <span className="text-base font-black" style={{ color: accentColor, marginTop: 4 }}>
                    ${product.price.toLocaleString("es-AR")}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {!hasSpecificIds && products.length < total && (
        <div ref={sentinelRef} className="flex justify-center py-3">
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
  const baseStyle: CSSProperties = { borderRadius: 8, padding: "10px 16px", fontSize: 15, width: "100%", display: "block", ...inputOverride }

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
      <div className="flex flex-col gap-2 mt-1">
        {opts.map(o => (
          <label key={o.value} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: inputOverride.color || "#e1e1ef" }}>
            <input type="radio" name={key} value={o.value} checked={value === o.value} onChange={() => onChange(key, o.value)} style={{ accentColor }} />
            {o.label}
          </label>
        ))}
      </div>
    )
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 cursor-pointer text-sm mt-1" style={{ color: inputOverride.color || "#e1e1ef" }}>
        <input type="checkbox" className="custom-checkbox" checked={value === "true"} onChange={e => onChange(key, e.target.checked ? "true" : "false")} />
        {field.placeholder ?? field.label}
      </label>
    )
  }

  if (field.type === "textarea") {
    return <textarea className="input-field" style={{ ...baseStyle, minHeight: 100, resize: "vertical" }} placeholder={field.placeholder} value={value} onChange={e => onChange(key, e.target.value)} rows={3} />
  }

  const htmlType = field.type === "phone" ? "tel" : field.type
  return <input type={htmlType} className="input-field" style={baseStyle} placeholder={field.placeholder} value={value} onChange={e => onChange(key, e.target.value)} />
}
