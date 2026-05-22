"use client"

import { useState, useCallback, type CSSProperties } from "react"
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
  type: "text" | "email" | "tel" | "phone" | "number" | "date" | "select" | "radio" | "checkbox" | "textarea"
  label: string
  placeholder?: string
  required?: boolean
  fullWidth?: boolean
  options?: Array<string | { label: string; value: string }>
}

function normalizeOptions(options: FormField["options"]): { label: string; value: string }[] {
  if (!options) return []
  return options.map(o => (typeof o === "string" ? { label: o, value: o } : o))
}

interface FormStep { id: string; title: string; fields: FormField[] }

interface CotizadorConfig {
  enabled: boolean; basePrice: number; currency: string; priceLabel: string; unit?: string
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
  const steps = resolveSteps(form)
  const cotizador = form.cotizador_config
  const hasCotizador = !!cotizador?.enabled
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
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const pageBg = isDark ? "#000000" : "#ffffff"

  const computePrice = useCallback(() => {
    if (!hasCotizador || !cotizador) return 0
    let total = cotizador.basePrice ?? 0
    for (const rule of cotizador.rules ?? []) {
      if (values[rule.fieldId] === rule.value) total += rule.delta
    }
    return Math.max(0, total)
  }, [hasCotizador, cotizador, values])

  const price = computePrice()
  const currency = cotizador?.currency ?? "$"
  const priceLabel = cotizador?.priceLabel ?? "Precio estimado"
  const unit = cotizador?.unit ?? "/mes"

  const handleChange = (id: string, val: string) => setValues(prev => ({ ...prev, [id]: val }))
  const handleNext = () => { setAnimDir("fwd"); setAnimKey(k => k + 1); setStep(s => Math.min(s + 1, steps.length - 1)) }
  const handleBack = () => { setAnimDir("bwd"); setAnimKey(k => k + 1); setStep(s => Math.max(s - 1, 0)) }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_id: form.id, user_id: form.user_id, data: values }),
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
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: pageBg, fontFamily: "'Plus Jakarta Sans', sans-serif", transition: "background-color 0.3s ease" }}>
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

      <div className={`w-full max-w-5xl relative z-10 grid grid-cols-1 gap-4 ${hasCotizador ? "lg:grid-cols-12" : ""}`}>

        <div className={`flex flex-col gap-4 ${hasCotizador ? "lg:col-span-8" : ""}`}>

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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                {activeStep.fields.map((field, fi) => (
                  <div key={field.id ?? fi} className={`flex flex-col gap-1.5 ${field.fullWidth || field.type === "textarea" ? "md:col-span-2" : ""}`}>
                    <label className="input-label text-xs font-medium" style={{ color: labelColor }}>
                      {field.label}
                      {field.required && <span className="ml-0.5" style={{ color: color1 }}>*</span>}
                    </label>
                    <FieldInput field={field} value={values[field.label] ?? ""} onChange={handleChange} accentColor={color1} inputOverride={inputOverride} />
                  </div>
                ))}
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
        </div>

        {/* Cotizador */}
        {hasCotizador && (
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden" style={{ background: themeGradient, boxShadow: `0 8px 32px ${color1}1a` }}>
              <div className="absolute rounded-full" style={{ top: 0, right: 0, width: 128, height: 128, backgroundColor: "rgba(255,255,255,0.1)", transform: "translate(50%,-50%)", filter: "blur(24px)" }} />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: onGradientDim }}>{priceLabel}</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="font-bold" style={{ fontSize: 44, color: onGradient, lineHeight: 1.1 }}>{currency}{price.toLocaleString("es-AR")}</span>
                  <span className="text-sm font-medium" style={{ color: onGradientDim }}>{unit}</span>
                </div>
              </div>
              <div className="rounded-xl p-3 flex flex-col gap-2 border border-white/10" style={{ backgroundColor: "rgba(17,19,28,0.2)", backdropFilter: "blur(8px)" }}>
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: onGradient }}>Precio base</span>
                  <span className="text-xs font-bold" style={{ color: onGradient }}>{currency}{(cotizador?.basePrice ?? 0).toLocaleString("es-AR")}</span>
                </div>
                {(cotizador?.breakdown ?? []).map((line, j) => (
                  <div key={j} className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: onGradient }}>{line.label}</span>
                    <span className="text-xs font-bold" style={{ color: onGradient }}>{line.amount !== undefined ? `${currency}${line.amount}` : "--"}</span>
                  </div>
                ))}
                <div className="h-px my-1" style={{ backgroundColor: "rgba(0,0,0,0.15)" }} />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold" style={{ color: onGradient }}>Total</span>
                  <span className="text-sm font-bold" style={{ color: onGradient }}>{currency}{price.toLocaleString("es-AR")}</span>
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

            {/* Powered by CODEA */}
            <a
              href="https://codeadesarrollos.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", textDecoration: "none", lineHeight: 1, gap: 4 }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.25em", textTransform: "uppercase", color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.3)" }}>
                powered by
              </span>
              <span style={{
                fontSize: "clamp(48px, 8vw, 80px)",
                fontWeight: 900,
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                lineHeight: 1,
                color: isDark ? "#ffffff" : "#000000",
              }}>
                CODEA
              </span>
            </a>
          </div>
        )}
      </div>
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
