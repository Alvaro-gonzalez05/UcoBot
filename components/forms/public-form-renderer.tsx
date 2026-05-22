"use client"

import { useState, useCallback, type CSSProperties } from "react"
import { toast } from "sonner"

// ---- Theme helpers ----
function hexLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function darkenHex(hex: string, factor: number): string {
  const r = Math.floor(parseInt(hex.slice(1, 3), 16) * factor)
  const g = Math.floor(parseInt(hex.slice(3, 5), 16) * factor)
  const b = Math.floor(parseInt(hex.slice(5, 7), 16) * factor)
  return `rgb(${r},${g},${b})`
}

// ---- Types ----
interface FormField {
  id: string
  type: "text" | "email" | "tel" | "phone" | "number" | "date" | "select" | "radio" | "checkbox" | "textarea"
  label: string
  placeholder?: string
  required?: boolean
  fullWidth?: boolean
  options?: { label: string; value: string }[]
}

interface FormStep {
  id: string
  title: string
  fields: FormField[]
}

interface CotizadorConfig {
  enabled: boolean
  basePrice: number
  currency: string
  priceLabel: string
  unit?: string
  rules?: Array<{ fieldId: string; value: string; delta: number }>
  breakdown?: Array<{ label: string; fieldId?: string; amount?: number }>
}

interface FormModel {
  id: string
  name: string
  description?: string
  type: string
  fields?: FormField[]
  steps?: FormStep[]
  cotizador_config?: CotizadorConfig
  settings?: { logo?: string; theme?: { color1?: string; color2?: string } }
  slug: string
  user_id: string
}

// ---- Helpers ----
function resolveSteps(form: FormModel): FormStep[] {
  if (form.steps && form.steps.length > 0) return form.steps
  if (form.fields && form.fields.length > 0) {
    return [{ id: "default", title: form.name, fields: form.fields }]
  }
  return []
}

const STEP_ICONS = ["person", "security", "assignment", "check_circle", "info", "payments"]

// ---- Main component ----
export function PublicFormRenderer({ form }: { form: FormModel }) {
  const steps = resolveSteps(form)
  const cotizador = form.cotizador_config
  const hasCotizador = !!cotizador?.enabled
  const logo = form.settings?.logo
  const color1 = form.settings?.theme?.color1 || "#b4f577"
  const color2 = form.settings?.theme?.color2 || "#00c6b6"
  const themeGradient = `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`
  const onGradient = hexLuminance(color1) > 0.35 ? darkenHex(color1, 0.25) : "#f0f0f0"
  const onGradientDim = hexLuminance(color1) > 0.35 ? darkenHex(color1, 0.3) + "cc" : "rgba(240,240,240,0.8)"

  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

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

  const handleChange = (id: string, val: string) =>
    setValues(prev => ({ ...prev, [id]: val }))

  const handleNext = () => setStep(s => Math.min(s + 1, steps.length - 1))
  const handleBack = () => setStep(s => Math.max(s - 1, 0))

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: form.id, data: values }),
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
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: "#11131c", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        <div className="glass-panel rounded-2xl text-center" style={{ padding: 40, maxWidth: 480 }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 64, color: "#00c6b6", fontVariationSettings: "'FILL' 1", display: "block", marginBottom: 16 }}
          >
            check_circle
          </span>
          <h2 className="text-2xl font-bold mb-2" style={{ color: "#ffffff" }}>
            ¡Formulario enviado!
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#c2c9b5" }}>
            Gracias por completar el formulario. Nos pondremos en contacto contigo pronto.
          </p>
        </div>
      </div>
    )
  }

  const activeStep = steps[step]
  const isLast = step === steps.length - 1

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 md:p-8 relative overflow-x-hidden"
      style={{ backgroundColor: "#11131c", fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#e1e1ef" }}
    >
      {/* Abstract background elements */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ top: "-10%", left: "-10%", width: "40%", height: "40%", background: "rgba(180,245,119,0.05)", filter: "blur(120px)", zIndex: 0 }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ bottom: "-10%", right: "-10%", width: "50%", height: "50%", background: "rgba(0,198,182,0.10)", filter: "blur(150px)", zIndex: 0 }}
      />

      {/* Main grid */}
      <div
        className={`w-full max-w-5xl relative z-10 grid grid-cols-1 gap-4 ${hasCotizador ? "lg:grid-cols-12" : ""}`}
      >
        {/* LEFT: Form flow */}
        <div className={`flex flex-col gap-4 ${hasCotizador ? "lg:col-span-8" : ""}`}>

          {/* Header */}
          <header className="glass-panel rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#ffffff" }}>
                {logo && (
                  <img src={logo} alt="Logo" style={{ width: 34, height: 34, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                )}
                {form.name}
              </h1>
              {form.description && (
                <p className="text-sm mt-1" style={{ color: "#c2c9b5" }}>{form.description}</p>
              )}
            </div>

            {steps.length > 1 && (
              <div className="flex items-center gap-1">
                {steps.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-1">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                      style={
                        i <= step
                          ? { background: themeGradient, color: onGradient }
                          : { backgroundColor: "#282933", border: "1px solid #424939", color: "#c2c9b5" }
                      }
                    >
                      {i + 1}
                    </div>
                    {i < steps.length - 1 && (
                      <div
                        className="h-1 w-4 rounded-full"
                        style={{ backgroundColor: i < step ? color1 + "4d" : "#282933" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </header>

          {/* Active step */}
          {activeStep && (
            <section className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <h2 className="text-xl font-semibold" style={{ color: "#ffffff" }}>{activeStep.title}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                {activeStep.fields.map(field => (
                  <div
                    key={field.id}
                    className={`flex flex-col gap-1.5 ${field.fullWidth || field.type === "textarea" ? "md:col-span-2" : ""}`}
                  >
                    <label className="input-label text-xs font-medium">
                      {field.label}
                      {field.required && <span className="ml-0.5" style={{ color: "#00c6b6" }}>*</span>}
                    </label>
                    <FieldInput field={field} value={values[field.id] ?? ""} onChange={handleChange} />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                {step > 0 ? (
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium transition-all"
                    style={{ backgroundColor: "#282933", color: "#c2c9b5", border: "1px solid #424939", cursor: "pointer" }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                    Atrás
                  </button>
                ) : <div />}

                {isLast ? (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold shadow-lg transition-all"
                    style={{ background: themeGradient, color: onGradient, border: "none", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}
                  >
                    {submitting ? "Enviando..." : "Enviar formulario"}
                    {!submitting && <span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span>}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold shadow-lg transition-all"
                    style={{ background: themeGradient, color: onGradient, border: "none", cursor: "pointer" }}
                  >
                    Continuar
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Locked upcoming steps */}
          {steps.slice(step + 1).map((futureStep, i) => (
            <section
              key={futureStep.id}
              className="glass-panel rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden"
              style={{ opacity: 0.6, pointerEvents: "none" }}
            >
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ backgroundColor: "rgba(12,14,23,0.5)", backdropFilter: "blur(2px)", zIndex: 10 }}
              >
                <div
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium shadow-lg"
                  style={{ background: themeGradient, color: onGradient }}
                >
                  {i === 0 ? "Continuar para desbloquear" : "Paso bloqueado"}
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    {i === 0 ? "arrow_forward" : "lock"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <h2 className="text-xl font-semibold" style={{ color: "#c2c9b5" }}>{futureStep.title}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                {futureStep.fields.slice(0, 4).map(f => (
                  <div key={f.id} className={`flex flex-col gap-1.5 ${f.fullWidth ? "md:col-span-2" : ""}`}>
                    <label className="input-label text-xs font-medium">{f.label}</label>
                    <div className="input-field rounded-lg" style={{ height: 44 }} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* RIGHT: Cotizador */}
        {hasCotizador && (
          <div className="lg:col-span-4 flex flex-col gap-4">

            {/* Price card */}
            <div
              className="rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden"
              style={{ background: themeGradient, boxShadow: `0 8px 32px ${color1}1a` }}
            >
              {/* Decorative circle */}
              <div
                className="absolute rounded-full"
                style={{ top: 0, right: 0, width: 128, height: 128, backgroundColor: "rgba(255,255,255,0.1)", transform: "translate(50%, -50%)", filter: "blur(24px)" }}
              />

              <div>
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: onGradientDim }}>
                  {priceLabel}
                </p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="font-bold" style={{ fontSize: 44, color: onGradient, lineHeight: 1.1 }}>
                    {currency}{price.toLocaleString("es-AR")}
                  </span>
                  <span className="text-sm font-medium" style={{ color: onGradientDim }}>{unit}</span>
                </div>
              </div>

              {/* Breakdown */}
              <div
                className="rounded-xl p-3 flex flex-col gap-2 border border-white/10"
                style={{ backgroundColor: "rgba(17,19,28,0.2)", backdropFilter: "blur(8px)" }}
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: onGradient }}>Precio base</span>
                  <span className="text-xs font-bold" style={{ color: onGradient }}>
                    {currency}{(cotizador?.basePrice ?? 0).toLocaleString("es-AR")}
                  </span>
                </div>
                {(cotizador?.breakdown ?? []).map((line, j) => (
                  <div key={j} className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: onGradient }}>{line.label}</span>
                    <span className="text-xs font-bold" style={{ color: onGradient }}>
                      {line.amount !== undefined ? `${currency}${line.amount}` : "--"}
                    </span>
                  </div>
                ))}
                <div className="h-px my-1" style={{ backgroundColor: "rgba(0,0,0,0.15)" }} />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold" style={{ color: onGradient }}>Total</span>
                  <span className="text-sm font-bold" style={{ color: onGradient }}>
                    {currency}{price.toLocaleString("es-AR")}
                  </span>
                </div>
              </div>
            </div>

            {/* Trust badge */}
            <div
              className="glass-panel rounded-xl p-4 flex items-start gap-3"
              style={{ borderLeft: "2px solid #00c6b6" }}
            >
              <span className="material-symbols-outlined mt-0.5" style={{ color: "#00c6b6" }}>verified_user</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: "#ffffff" }}>Seguro y confiable</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "#c2c9b5" }}>
                  Tus datos están protegidos. Al completar recibirás una confirmación por WhatsApp.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Field renderer ----
function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField
  value: string
  onChange: (id: string, val: string) => void
}) {
  const baseStyle: CSSProperties = { borderRadius: 8, padding: "10px 16px", fontSize: 15, width: "100%", display: "block" }

  if (field.type === "select") {
    return (
      <select
        className="input-field"
        style={baseStyle}
        value={value}
        onChange={e => onChange(field.id, e.target.value)}
      >
        <option value="">Seleccionar...</option>
        {field.options?.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }

  if (field.type === "radio") {
    return (
      <div className="flex flex-col gap-2 mt-1">
        {field.options?.map(o => (
          <label key={o.value} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: "#e1e1ef" }}>
            <input
              type="radio"
              name={field.id}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(field.id, o.value)}
              style={{ accentColor: "#00c6b6" }}
            />
            {o.label}
          </label>
        ))}
      </div>
    )
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 cursor-pointer text-sm mt-1" style={{ color: "#e1e1ef" }}>
        <input
          type="checkbox"
          className="custom-checkbox"
          checked={value === "true"}
          onChange={e => onChange(field.id, e.target.checked ? "true" : "false")}
        />
        {field.placeholder ?? field.label}
      </label>
    )
  }

  if (field.type === "textarea") {
    return (
      <textarea
        className="input-field"
        style={{ ...baseStyle, minHeight: 100, resize: "vertical" }}
        placeholder={field.placeholder}
        value={value}
        onChange={e => onChange(field.id, e.target.value)}
        rows={3}
      />
    )
  }

  const htmlType = field.type === "phone" ? "tel" : field.type
  return (
    <input
      type={htmlType}
      className="input-field"
      style={baseStyle}
      placeholder={field.placeholder}
      value={value}
      onChange={e => onChange(field.id, e.target.value)}
    />
  )
}
