"use client"

import { useEffect, useState } from "react"
import QRCode from "react-qr-code"

interface Reward {
  id: string
  name: string
  description: string | null
  points_cost: number
  reward_type: string
  reward_value: string | null
  current_stock: number | null
}

interface CardSettings {
  card_type: "points" | "stamps"
  stamps_required: number
  stamp_reward: string | null
  card_color: string
  logo_url: string | null
  cover_image_url: string | null
}

interface LoyaltyCardViewProps {
  businessName: string
  clientName: string
  points: number
  stamps: number
  totalPurchases: number
  loyaltyCode: string
  rewards: Reward[]
  settings: CardSettings
}

export function LoyaltyCardView({
  businessName,
  clientName,
  points,
  stamps,
  totalPurchases,
  loyaltyCode,
  rewards,
  settings,
}: LoyaltyCardViewProps) {
  const [cardUrl, setCardUrl] = useState("")

  useEffect(() => {
    setCardUrl(`${window.location.origin}/tarjeta/${loyaltyCode}`)
  }, [loyaltyCode])

  const accent = settings.card_color || "#D1F366"
  const isStamps = settings.card_type === "stamps"
  const currentStamps = Math.min(stamps, settings.stamps_required)
  const nextReward = rewards.find((r) => r.points_cost > points)
  const initials = clientName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <div className="min-h-dvh bg-[#0c0e17] text-white pb-10">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-5">
        {/* Tarjeta */}
        <div
          className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#1C1C28] to-[#16161f] border shadow-2xl"
          style={{ borderColor: `${accent}40` }}
        >
          {/* Portada */}
          {settings.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.cover_image_url}
              alt={businessName}
              className="h-36 w-full object-cover"
            />
          ) : (
            <div
              className="h-24 w-full"
              style={{
                background: `linear-gradient(120deg, ${accent}40 0%, ${accent}14 55%, transparent 100%)`,
              }}
            />
          )}

          <div className="relative p-6 -mt-10">
            {/* Logo / iniciales + nombre */}
            <div className="flex items-end justify-between mb-5">
              <div className="flex items-center gap-3">
                {settings.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={settings.logo_url}
                    alt={businessName}
                    className="w-16 h-16 rounded-2xl object-cover border-4 border-[#1C1C28] bg-white shadow-lg"
                  />
                ) : (
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-lg border-4 border-[#1C1C28] shadow-lg"
                    style={{ backgroundColor: accent, color: "#1C1C28" }}
                  >
                    {businessName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="pt-8">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-semibold">
                    {isStamps ? "Tarjeta de sellos" : "Tarjeta de fidelidad"}
                  </p>
                  <h1 className="text-lg font-black leading-tight">{businessName}</h1>
                </div>
              </div>
            </div>

            <p className="text-sm text-white/70">{clientName}</p>

            {isStamps ? (
              <>
                {/* Sellos */}
                <div className="flex items-end gap-2 mt-1 mb-5">
                  <p className="text-5xl font-black leading-none" style={{ color: accent }}>
                    {currentStamps}
                    <span className="text-2xl text-white/40">/{settings.stamps_required}</span>
                  </p>
                  <p className="text-sm text-white/60 mb-1">sellos</p>
                </div>

                <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-4 mb-5">
                  <div className="grid grid-cols-5 gap-3">
                    {Array.from({ length: settings.stamps_required }).map((_, i) => (
                      <div
                        key={i}
                        className="aspect-square rounded-full flex items-center justify-center text-lg font-black transition-all"
                        style={
                          i < currentStamps
                            ? { backgroundColor: accent, color: "#1C1C28" }
                            : {
                                backgroundColor: "rgba(255,255,255,0.92)",
                                color: "rgba(28,28,40,0.15)",
                                border: "2px dashed rgba(28,28,40,0.12)",
                              }
                        }
                      >
                        {i < currentStamps ? "✓" : i + 1}
                      </div>
                    ))}
                  </div>
                  <p className="text-center text-xs text-white/70 mt-4">
                    Completá los sellos y llevate{" "}
                    <span className="font-bold" style={{ color: accent }}>
                      {settings.stamp_reward || "tu regalo"}
                    </span>{" "}
                    en tu {settings.stamps_required}ª compra
                  </p>
                  {currentStamps >= settings.stamps_required && (
                    <p
                      className="text-center text-sm font-black mt-2 animate-pulse"
                      style={{ color: accent }}
                    >
                      🎉 ¡Tarjeta completa! Reclamá tu regalo en el local
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-end gap-2 mt-1 mb-6">
                <p className="text-5xl font-black leading-none" style={{ color: accent }}>
                  {points.toLocaleString("es-AR")}
                </p>
                <p className="text-sm text-white/60 mb-1">puntos</p>
              </div>
            )}

            {/* QR */}
            <div className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2">
              {cardUrl ? (
                <QRCode value={cardUrl} size={160} fgColor="#1C1C28" />
              ) : (
                <div className="w-[160px] h-[160px] bg-gray-100 rounded animate-pulse" />
              )}
              <p className="text-[10px] text-gray-500 font-medium">
                Mostrá este código al pagar para {isStamps ? "sumar sellos" : "sumar y canjear puntos"}
              </p>
            </div>

            <div className="flex items-center justify-between mt-4 text-[11px] text-white/40">
              <span>
                {totalPurchases} compra{totalPurchases === 1 ? "" : "s"} realizadas
              </span>
              <span className="font-mono">{loyaltyCode.slice(0, 8).toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Solo modo puntos: progreso y premios */}
        {!isStamps && (
          <>
            {nextReward && (
              <div className="rounded-2xl bg-[#1C1C28] border border-white/10 p-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <p className="font-semibold">
                    🎯 Te faltan {(nextReward.points_cost - points).toLocaleString("es-AR")} puntos
                  </p>
                  <p className="text-white/50 text-xs">{nextReward.name}</p>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (points / nextReward.points_cost) * 100)}%`,
                      backgroundColor: accent,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-white/50 font-semibold px-1">
                Premios disponibles
              </p>
              {rewards.length === 0 ? (
                <div className="rounded-2xl bg-[#1C1C28] border border-white/10 p-5 text-center text-sm text-white/50">
                  El negocio todavía no cargó premios. ¡Seguí sumando puntos!
                </div>
              ) : (
                rewards.map((reward) => {
                  const unlocked = points >= reward.points_cost
                  return (
                    <div
                      key={reward.id}
                      className="rounded-2xl border p-4 flex items-center gap-3"
                      style={
                        unlocked
                          ? { backgroundColor: `${accent}1a`, borderColor: `${accent}66` }
                          : { backgroundColor: "#1C1C28", borderColor: "rgba(255,255,255,0.1)" }
                      }
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                        style={unlocked ? { backgroundColor: accent } : { backgroundColor: "rgba(255,255,255,0.05)" }}
                      >
                        {unlocked ? "🎁" : "🔒"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{reward.name}</p>
                        {reward.description && (
                          <p className="text-xs text-white/50 truncate">{reward.description}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-black" style={{ color: unlocked ? accent : "rgba(255,255,255,0.6)" }}>
                          {reward.points_cost.toLocaleString("es-AR")}
                        </p>
                        <p className="text-[10px] text-white/40">puntos</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}

        <p className="text-center text-[10px] text-white/30 pt-2">
          {isStamps
            ? "Los sellos se suman en el local mostrando tu QR · Powered by UcoBot"
            : "Los canjes se realizan en el local mostrando tu QR · Powered by UcoBot"}
        </p>
      </div>
    </div>
  )
}
