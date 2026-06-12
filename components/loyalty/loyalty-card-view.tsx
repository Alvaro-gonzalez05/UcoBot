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

interface LoyaltyCardViewProps {
  businessName: string
  clientName: string
  points: number
  totalPurchases: number
  loyaltyCode: string
  rewards: Reward[]
}

export function LoyaltyCardView({
  businessName,
  clientName,
  points,
  totalPurchases,
  loyaltyCode,
  rewards,
}: LoyaltyCardViewProps) {
  const [cardUrl, setCardUrl] = useState("")

  useEffect(() => {
    setCardUrl(`${window.location.origin}/tarjeta/${loyaltyCode}`)
  }, [loyaltyCode])

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
      <div className="max-w-md mx-auto px-4 pt-8 space-y-5">
        {/* Tarjeta */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#1C1C28] via-[#1C1C28] to-[#2a2d1f] border border-[#D1F366]/20 p-6 shadow-2xl">
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 80% 10%, rgba(209,243,102,0.25) 0%, transparent 45%), radial-gradient(circle at 10% 90%, rgba(209,243,102,0.12) 0%, transparent 40%)",
            }}
          />

          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-semibold">
                  Tarjeta de fidelidad
                </p>
                <h1 className="text-lg font-black mt-0.5">{businessName}</h1>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-[#D1F366] text-[#1C1C28] flex items-center justify-center font-black text-sm">
                {initials || "🪪"}
              </div>
            </div>

            <p className="text-sm text-white/70">{clientName}</p>
            <div className="flex items-end gap-2 mt-1 mb-6">
              <p className="text-5xl font-black text-[#D1F366] leading-none">
                {points.toLocaleString("es-AR")}
              </p>
              <p className="text-sm text-white/60 mb-1">puntos</p>
            </div>

            {/* QR */}
            <div className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2">
              {cardUrl ? (
                <QRCode value={cardUrl} size={168} fgColor="#1C1C28" />
              ) : (
                <div className="w-[168px] h-[168px] bg-gray-100 rounded animate-pulse" />
              )}
              <p className="text-[10px] text-gray-500 font-medium">
                Mostrá este código al pagar para sumar y canjear puntos
              </p>
            </div>

            <div className="flex items-center justify-between mt-4 text-[11px] text-white/40">
              <span>{totalPurchases} compra{totalPurchases === 1 ? "" : "s"} realizadas</span>
              <span className="font-mono">{loyaltyCode.slice(0, 8).toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Próximo premio */}
        {nextReward && (
          <div className="rounded-2xl bg-[#1C1C28] border border-white/10 p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <p className="font-semibold">🎯 Te faltan {(nextReward.points_cost - points).toLocaleString("es-AR")} puntos</p>
              <p className="text-white/50 text-xs">{nextReward.name}</p>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-[#D1F366] rounded-full transition-all"
                style={{ width: `${Math.min(100, (points / nextReward.points_cost) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Premios */}
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
                  className={`rounded-2xl border p-4 flex items-center gap-3 ${
                    unlocked
                      ? "bg-[#D1F366]/10 border-[#D1F366]/40"
                      : "bg-[#1C1C28] border-white/10"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
                      unlocked ? "bg-[#D1F366] " : "bg-white/5"
                    }`}
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
                    <p className={`text-sm font-black ${unlocked ? "text-[#D1F366]" : "text-white/60"}`}>
                      {reward.points_cost.toLocaleString("es-AR")}
                    </p>
                    <p className="text-[10px] text-white/40">puntos</p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <p className="text-center text-[10px] text-white/30 pt-2">
          Los canjes se realizan en el local mostrando tu QR · Powered by UcoBot
        </p>
      </div>
    </div>
  )
}
