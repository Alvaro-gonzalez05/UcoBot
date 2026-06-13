"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Loader2, Star, Stamp, Upload } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export type LoyaltyCardType = "points" | "stamps"

interface LoyaltyConfig {
  is_active: boolean
  card_type: LoyaltyCardType
  points_per_unit: number
  unit_amount: number
  stamps_required: number
  stamp_reward: string
  card_color: string
  logo_url: string
  cover_image_url: string
  cover_position: number // 0 = arriba, 100 = abajo (object-position vertical)
  logo_fit: "cover" | "contain"
}

const DEFAULT_CONFIG: LoyaltyConfig = {
  is_active: true,
  card_type: "points",
  points_per_unit: 1,
  unit_amount: 100,
  stamps_required: 10,
  stamp_reward: "",
  card_color: "#D1F366",
  logo_url: "",
  cover_image_url: "",
  cover_position: 50,
  logo_fit: "cover",
}

function ImageField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: string
  onChange: (url: string) => void
  hint: string
}) {
  const [uploading, setUploading] = useState(false)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload-image", { method: "POST", body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Error al subir")
      onChange(json.url)
      toast.success(`${label} subida`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir la imagen")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="url"
          placeholder="https://… o subí un archivo"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-xl flex-1"
        />
        <label className="cursor-pointer">
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          </span>
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-muted-foreground hover:text-red-500"
          >
            Quitar
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

/** Vista previa compacta de la tarjeta tal como la ve el cliente final.
 *  La portada se puede arrastrar verticalmente para encuadrarla. */
function CardPreview({
  config,
  businessLabel,
  onCoverPositionChange,
}: {
  config: LoyaltyConfig
  businessLabel: string
  onCoverPositionChange?: (position: number) => void
}) {
  const accent = config.card_color || "#D1F366"
  const demoStamps = Math.min(4, config.stamps_required - 1)
  const dragRef = useRef<{ startY: number; startPos: number } | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!config.cover_image_url || !onCoverPositionChange) return
    dragRef.current = { startY: e.clientY, startPos: config.cover_position }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !onCoverPositionChange) return
    // Arrastrar hacia abajo revela la parte superior de la imagen
    const delta = e.clientY - dragRef.current.startY
    const next = Math.max(0, Math.min(100, dragRef.current.startPos - delta * 0.8))
    onCoverPositionChange(Math.round(next))
  }

  const handlePointerUp = () => {
    dragRef.current = null
  }

  return (
    <div className="max-w-[360px] mx-auto space-y-3">
      {/* Tarjeta apaisada (igual que la ve el cliente) */}
      <div
        className="relative w-full aspect-[1.6/1] rounded-3xl overflow-hidden border shadow-xl text-white"
        style={{ borderColor: `${accent}55` }}
      >
        {/* Fondo: portada arrastrable o degradado */}
        {config.cover_image_url ? (
          <div
            className="absolute inset-0 cursor-grab active:cursor-grabbing select-none touch-none group/cover"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={config.cover_image_url}
              alt="Portada"
              draggable={false}
              className="h-full w-full object-cover pointer-events-none"
              style={{ objectPosition: `center ${config.cover_position}%` }}
            />
            {onCoverPositionChange && (
              <span className="absolute top-2 left-1/2 -translate-x-1/2 z-10 rounded-full bg-black/60 backdrop-blur px-2.5 py-1 text-[9px] font-bold text-white/90 opacity-0 group-hover/cover:opacity-100 transition-opacity pointer-events-none">
                ↕ Arrastrá para encuadrar
              </span>
            )}
          </div>
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(120deg, #1C1C28 0%, ${accent}26 100%)` }}
          />
        )}
        {/* Velo para legibilidad */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(100deg, rgba(12,14,23,0.92) 0%, rgba(12,14,23,0.72) 45%, rgba(12,14,23,0.45) 100%)" }}
        />

        {/* Contenido */}
        <div className="relative h-full flex pointer-events-none">
          <div className="flex-1 min-w-0 p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              {config.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={config.logo_url}
                  alt="Logo"
                  className={cn(
                    "w-11 h-11 rounded-xl bg-white shadow-md flex-shrink-0",
                    config.logo_fit === "contain" ? "object-contain p-1" : "object-cover"
                  )}
                />
              ) : (
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm shadow-md flex-shrink-0"
                  style={{ backgroundColor: accent, color: "#14151f" }}
                >
                  {businessLabel.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[8px] uppercase tracking-[0.2em] text-white/55 font-semibold">
                  {config.card_type === "stamps" ? "Tarjeta de sellos" : "Tarjeta de fidelidad"}
                </p>
                <p className="text-sm font-black leading-tight truncate">{businessLabel}</p>
              </div>
            </div>

            <div className="min-w-0">
              <p className="text-[11px] text-white/60 truncate">Cliente de ejemplo</p>
              {config.card_type === "stamps" ? (
                <p className="text-2xl font-black leading-none mt-0.5" style={{ color: accent }}>
                  {demoStamps}
                  <span className="text-base text-white/40">/{config.stamps_required}</span>
                  <span className="text-[11px] text-white/50 font-bold ml-1.5">sellos</span>
                </p>
              ) : (
                <p className="text-2xl font-black leading-none mt-0.5" style={{ color: accent }}>
                  1.250<span className="text-[11px] text-white/50 font-bold ml-1.5">puntos</span>
                </p>
              )}
            </div>
          </div>

          {/* QR de muestra */}
          <div className="flex items-center justify-center pr-4">
            <div className="bg-white rounded-xl p-2 shadow-lg">
              <div className="grid grid-cols-5 gap-0.5">
                {Array.from({ length: 25 }).map((_, i) => (
                  <div key={i} className={cn("w-1.5 h-1.5", [0,1,2,4,5,7,9,10,12,14,16,18,19,21,23,24].includes(i) ? "bg-[#14151f]" : "bg-white")} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {config.card_type === "stamps" && (
        <div className="rounded-2xl bg-[#14151f] border border-border p-3">
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: config.stamps_required }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-full flex items-center justify-center text-xs font-bold"
                style={
                  i < demoStamps
                    ? { backgroundColor: accent, color: "#14151f" }
                    : { backgroundColor: "rgba(255,255,255,0.92)", color: "#14151f33" }
                }
              >
                {i < demoStamps ? "✓" : ""}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-center text-white/70 mt-2">
            Completá los sellos y llevate{" "}
            <span className="font-bold" style={{ color: accent }}>
              {config.stamp_reward || "tu regalo"}
            </span>
          </p>
        </div>
      )}
    </div>
  )
}

export function LoyaltyConfigPanel({
  userId,
  onCardTypeChange,
}: {
  userId: string
  onCardTypeChange?: (type: LoyaltyCardType) => void
}) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<LoyaltyConfig>(DEFAULT_CONFIG)
  const [businessLabel, setBusinessLabel] = useState("Tu negocio")

  useEffect(() => {
    supabase
      .from("user_profiles")
      .select("business_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.business_name) setBusinessLabel(data.business_name)
      })
  }, [userId])

  const update = (patch: Partial<LoyaltyConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch }
      if (patch.card_type && patch.card_type !== prev.card_type) {
        onCardTypeChange?.(patch.card_type)
      }
      return next
    })
  }

  useEffect(() => {
    supabase
      .from("loyalty_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const loaded: LoyaltyConfig = {
            is_active: data.is_active ?? true,
            card_type: (data.card_type as LoyaltyCardType) || "points",
            points_per_unit: data.points_per_unit ?? 1,
            unit_amount: Number(data.unit_amount) || 100,
            stamps_required: data.stamps_required ?? 10,
            stamp_reward: data.stamp_reward || "",
            card_color: data.card_color || "#D1F366",
            logo_url: data.logo_url || "",
            cover_image_url: data.cover_image_url || "",
            cover_position: data.cover_position ?? 50,
            logo_fit: data.logo_fit === "contain" ? "contain" : "cover",
          }
          setConfig(loaded)
          onCardTypeChange?.(loaded.card_type)
        } else {
          onCardTypeChange?.("points")
        }
        setLoading(false)
      })
  }, [userId])

  const handleSave = async () => {
    if (config.card_type === "stamps" && !config.stamp_reward.trim()) {
      toast.error("Definí el regalo de la tarjeta de sellos (ej: Un café gratis)")
      return
    }
    if (config.card_type === "points" && (!config.unit_amount || config.unit_amount <= 0)) {
      toast.error("El monto por punto debe ser mayor a 0")
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from("loyalty_settings").upsert({
        user_id: userId,
        is_active: config.is_active,
        card_type: config.card_type,
        points_per_unit: config.points_per_unit,
        unit_amount: config.unit_amount,
        stamps_required: config.stamps_required,
        stamp_reward: config.stamp_reward.trim() || null,
        card_color: config.card_color,
        logo_url: config.logo_url.trim() || null,
        cover_image_url: config.cover_image_url.trim() || null,
        cover_position: config.cover_position,
        logo_fit: config.logo_fit,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      toast.success("Programa de fidelización guardado")
    } catch (err) {
      console.error("Error saving loyalty config:", err)
      toast.error("No se pudo guardar la configuración")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-card rounded-3xl border border-border p-12 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="bg-card rounded-3xl border border-border p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="font-bold text-lg">Tarjeta de fidelización</h3>
          <p className="text-sm text-muted-foreground">
            Tus clientes la ven desde un link con su QR personal — se escanea en el Punto de Venta
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Programa activo</Label>
          <Switch checked={config.is_active} onCheckedChange={(c) => update({ is_active: c })} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Configuración */}
        <div className="space-y-6">
          {/* Tipo de tarjeta */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Tipo de tarjeta</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => update({ card_type: "points" })}
                className={cn(
                  "rounded-2xl border-2 p-4 text-left transition-all",
                  config.card_type === "points"
                    ? "border-[#D1F366] bg-[#D1F366]/10"
                    : "border-border hover:border-muted-foreground/40"
                )}
              >
                <Star className={cn("w-5 h-5 mb-2", config.card_type === "points" ? "text-[#D1F366]" : "text-muted-foreground")} />
                <p className="text-sm font-bold">Puntos</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Suma puntos por monto gastado y los canjea por recompensas del catálogo
                </p>
              </button>
              <button
                type="button"
                onClick={() => update({ card_type: "stamps" })}
                className={cn(
                  "rounded-2xl border-2 p-4 text-left transition-all",
                  config.card_type === "stamps"
                    ? "border-[#D1F366] bg-[#D1F366]/10"
                    : "border-border hover:border-muted-foreground/40"
                )}
              >
                <Stamp className={cn("w-5 h-5 mb-2", config.card_type === "stamps" ? "text-[#D1F366]" : "text-muted-foreground")} />
                <p className="text-sm font-bold">Sellos</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Un sello por visita; al completar la tarjeta se lleva un regalo
                </p>
              </button>
            </div>
          </div>

          {/* Reglas según tipo */}
          {config.card_type === "points" ? (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Acumulación</Label>
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-muted/30 p-4">
                <Input
                  type="number"
                  min="0"
                  value={String(config.points_per_unit)}
                  onChange={(e) => update({ points_per_unit: parseInt(e.target.value, 10) || 0 })}
                  className="w-20 rounded-xl"
                />
                <span className="text-sm text-muted-foreground">punto{config.points_per_unit === 1 ? "" : "s"} por cada $</span>
                <Input
                  type="number"
                  min="1"
                  value={String(config.unit_amount)}
                  onChange={(e) => update({ unit_amount: parseFloat(e.target.value) || 0 })}
                  className="w-28 rounded-xl"
                />
                <span className="text-sm text-muted-foreground">de compra</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Las recompensas canjeables se gestionan en el catálogo de acá abajo.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Regla de sellos</Label>
              <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Tarjeta completa a los</span>
                  <Input
                    type="number"
                    min="2"
                    max="30"
                    value={String(config.stamps_required)}
                    onChange={(e) => update({ stamps_required: Math.max(2, Math.min(30, parseInt(e.target.value, 10) || 10)) })}
                    className="w-20 rounded-xl"
                  />
                  <span className="text-sm text-muted-foreground">sellos (1 sello por compra)</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Regalo al completar *</Label>
                  <Input
                    placeholder="Ej: Un café gratis"
                    value={config.stamp_reward}
                    onChange={(e) => update({ stamp_reward: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Personalización */}
          <div className="space-y-4">
            <Label className="text-sm font-semibold">Diseño de la tarjeta</Label>
            <div className="flex items-center gap-3">
              <Label className="text-sm text-muted-foreground w-28">Color principal</Label>
              <input
                type="color"
                value={config.card_color}
                onChange={(e) => update({ card_color: e.target.value })}
                className="h-10 w-16 rounded-xl border border-border bg-transparent cursor-pointer"
              />
              <code className="text-xs text-muted-foreground">{config.card_color}</code>
            </div>
            <div className="space-y-2">
              <ImageField
                label="Logo del negocio"
                value={config.logo_url}
                onChange={(url) => update({ logo_url: url })}
                hint="Cuadrado, ideal 256×256. Aparece arriba a la izquierda de la tarjeta."
              />
              {config.logo_url && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Encaje:</span>
                  <button
                    type="button"
                    onClick={() => update({ logo_fit: "cover" })}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                      config.logo_fit === "cover" ? "bg-[#D1F366] text-[#1C1C28]" : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                  >
                    Recortar
                  </button>
                  <button
                    type="button"
                    onClick={() => update({ logo_fit: "contain" })}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                      config.logo_fit === "contain" ? "bg-[#D1F366] text-[#1C1C28]" : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                  >
                    Completo
                  </button>
                </div>
              )}
            </div>
            <ImageField
              label="Imagen de portada"
              value={config.cover_image_url}
              onChange={(url) => update({ cover_image_url: url })}
              hint="Horizontal, ideal 800×300. Arrastrala en la vista previa para encuadrarla. ↕"
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl px-8 gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando…
              </>
            ) : (
              "Guardar programa"
            )}
          </Button>
        </div>

        {/* Vista previa */}
        <div>
          <Label className="text-sm font-semibold block mb-3">Vista previa</Label>
          <CardPreview
            config={config}
            businessLabel={businessLabel}
            onCoverPositionChange={(position) => update({ cover_position: position })}
          />
          <p className="text-[11px] text-muted-foreground text-center mt-3">
            Así la ve tu cliente en su celular, con su QR y saldo reales.
          </p>
        </div>
      </div>
    </div>
  )
}
