"use client"

import { useEffect, useState } from "react"
import QRCode from "react-qr-code"
import { motion } from "framer-motion"

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
  cover_position: number
  logo_fit: "cover" | "contain"
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
  const completed = isStamps && currentStamps >= settings.stamps_required
  const nextReward = rewards.find((r) => r.points_cost > points)
  const initials = clientName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <div className="h-dvh overflow-hidden flex items-center justify-center bg-gradient-to-b from-[#0c0e17] to-[#15161f] text-white px-4 py-4">
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 230, damping: 22 }}
        className="relative w-full max-w-sm h-full max-h-[780px] rounded-[2rem] overflow-hidden border shadow-2xl flex flex-col bg-gradient-to-br from-[#1C1C28] to-[#16161f]"
        style={{ borderColor: `${accent}40` }}
      >
        {/* Portada */}
        {settings.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.cover_image_url}
            alt={businessName}
            className="h-28 w-full object-cover flex-shrink-0"
            style={{ objectPosition: `center ${settings.cover_position ?? 50}%` }}
          />
        ) : (
          <div
            className="h-20 w-full flex-shrink-0"
            style={{ background: `linear-gradient(120deg, ${accent}40 0%, ${accent}14 55%, transparent 100%)` }}
          />
        )}

        {/* Contenido — ocupa el resto y se reparte sin scroll */}
        <div className="relative flex-1 min-h-0 flex flex-col px-5 pb-4 -mt-9">
          {/* Identidad */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {settings.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logo_url}
                alt={businessName}
                className={
                  settings.logo_fit === "contain"
                    ? "w-14 h-14 rounded-2xl object-contain p-1 border-4 border-[#1C1C28] bg-white shadow-lg flex-shrink-0"
                    : "w-14 h-14 rounded-2xl object-cover border-4 border-[#1C1C28] bg-white shadow-lg flex-shrink-0"
                }
              />
            ) : (
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center font-black border-4 border-[#1C1C28] shadow-lg flex-shrink-0"
                style={{ backgroundColor: accent, color: "#1C1C28" }}
              >
                {businessName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="pt-7 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-semibold">
                {isStamps ? "Tarjeta de sellos" : "Tarjeta de fidelidad"}
              </p>
              <h1 className="text-base font-black leading-tight truncate">{businessName}</h1>
            </div>
          </div>

          {/* Saldo (puntos o sellos) */}
          <div className="flex items-center justify-between mt-3 flex-shrink-0">
            <p className="text-sm text-white/70 truncate">{clientName}</p>
            {isStamps ? (
              <p className="text-2xl font-black leading-none" style={{ color: accent }}>
                {currentStamps}
                <span className="text-base text-white/40">/{settings.stamps_required}</span>
              </p>
            ) : (
              <p className="text-2xl font-black leading-none" style={{ color: accent }}>
                {points.toLocaleString("es-AR")}
                <span className="text-xs text-white/50 ml-1">pts</span>
              </p>
            )}
          </div>

          {/* Centro: sellos o QR, ocupa el espacio libre y se centra */}
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 py-2">
            {isStamps ? (
              <div className="w-full">
                <div className="grid grid-cols-5 gap-2.5">
                  {Array.from({ length: settings.stamps_required }).map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.2 + i * 0.04, type: "spring", stiffness: 300, damping: 18 }}
                      className="aspect-square rounded-full flex items-center justify-center text-base font-black"
                      style={
                        i < currentStamps
                          ? { backgroundColor: accent, color: "#1C1C28" }
                          : {
                              backgroundColor: "rgba(255,255,255,0.92)",
                              color: "rgba(28,28,40,0.18)",
                              border: "2px dashed rgba(28,28,40,0.14)",
                            }
                      }
                    >
                      {i < currentStamps ? "✓" : i + 1}
                    </motion.div>
                  ))}
                </div>
                <p className="text-center text-xs text-white/70 mt-4">
                  Completá los sellos y llevate{" "}
                  <span className="font-bold" style={{ color: accent }}>
                    {settings.stamp_reward || "tu regalo"}
                  </span>
                </p>
              </div>
            ) : (
              nextReward && (
                <div className="w-full">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-white/70">🎯 {nextReward.name}</span>
                    <span className="text-white/50">faltan {(nextReward.points_cost - points).toLocaleString("es-AR")}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: accent }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (points / nextReward.points_cost) * 100)}%` }}
                      transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>
              )
            )}

            {/* QR con glow animado */}
            <div className="relative flex items-center justify-center">
              <motion.div
                className="absolute rounded-3xl"
                style={{ inset: -6, background: accent, filter: "blur(16px)" }}
                animate={{ opacity: [0.25, 0.5, 0.25], scale: [0.98, 1.02, 0.98] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative bg-white rounded-2xl p-3 shadow-xl">
                {cardUrl ? (
                  <QRCode value={cardUrl} size={150} fgColor="#1C1C28" />
                ) : (
                  <div className="w-[150px] h-[150px] bg-gray-100 rounded animate-pulse" />
                )}
              </div>
            </div>
            <p className="text-[11px] text-white/50 text-center">
              {completed
                ? "🎉 ¡Tarjeta completa! Reclamá tu regalo en el local"
                : `Mostrá este código al pagar para ${isStamps ? "sumar tu sello" : "sumar y canjear puntos"}`}
            </p>
          </div>

          {/* Premios (modo puntos) — tira horizontal, no agrega scroll vertical */}
          {!isStamps && rewards.length > 0 && (
            <div className="flex-shrink-0 -mx-5 px-5">
              <p className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2">Premios</p>
              <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
                {rewards.map((reward) => {
                  const unlocked = points >= reward.points_cost
                  return (
                    <div
                      key={reward.id}
                      className="flex-shrink-0 w-32 rounded-xl border p-2.5"
                      style={
                        unlocked
                          ? { backgroundColor: `${accent}1a`, borderColor: `${accent}66` }
                          : { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }
                      }
                    >
                      <p className="text-base mb-0.5">{unlocked ? "🎁" : "🔒"}</p>
                      <p className="text-xs font-semibold truncate">{reward.name}</p>
                      <p className="text-[11px] font-black" style={{ color: unlocked ? accent : "rgba(255,255,255,0.5)" }}>
                        {reward.points_cost.toLocaleString("es-AR")} pts
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-2 text-[10px] text-white/35 flex-shrink-0">
            <span>{totalPurchases} compra{totalPurchases === 1 ? "" : "s"}</span>
            <span className="font-mono">{loyaltyCode.slice(0, 8).toUpperCase()} · UcoBot</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
