"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import QRCode from "react-qr-code"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { loyaltyChannelName, type LoyaltyUpdatePayload } from "@/lib/loyalty-realtime"
import { Check } from "lucide-react"

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
  // createClient nunca debería tirar, pero lo protegemos para que un fallo
  // del cliente Realtime jamás deje la tarjeta en blanco.
  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch (e) {
      console.error("[loyalty] no se pudo iniciar Supabase client:", e)
      return null
    }
  }, [])

  // Valores en vivo (se actualizan por Realtime sin refrescar)
  const [livePoints, setLivePoints] = useState(points)
  const [liveStamps, setLiveStamps] = useState(stamps)
  const [livePurchases, setLivePurchases] = useState(totalPurchases)
  const pointsRef = useRef(points)
  const stampsRef = useRef(stamps)

  // Animaciones de actualización
  const [flash, setFlash] = useState<{ kind: "points" | "stamps"; amount: number; key: number } | null>(null)
  const [showCheck, setShowCheck] = useState(false)
  const [newStampRange, setNewStampRange] = useState<{ from: number; to: number } | null>(null)

  useEffect(() => {
    setCardUrl(`${window.location.origin}/tarjeta/${loyaltyCode}`)
  }, [loyaltyCode])

  // Aplica una actualización (venga de broadcast o de polling) con animación.
  // Compara contra los refs para no re-animar valores que ya mostramos.
  const applyUpdate = (p: LoyaltyUpdatePayload) => {
    let changed = false

    if (typeof p.points === "number" && p.points !== pointsRef.current) {
      const delta = p.points - pointsRef.current
      pointsRef.current = p.points
      setLivePoints(p.points)
      if (delta > 0) setFlash({ kind: "points", amount: delta, key: Date.now() })
      changed = true
    }

    if (typeof p.stamps === "number" && p.stamps !== stampsRef.current) {
      const prev = stampsRef.current
      stampsRef.current = p.stamps
      if (p.stamps > prev) {
        setNewStampRange({ from: prev, to: p.stamps })
        setFlash({ kind: "stamps", amount: p.stamps - prev, key: Date.now() })
        setTimeout(() => setNewStampRange(null), 1800)
      }
      setLiveStamps(p.stamps)
      changed = true
    }

    if (typeof p.total_purchases === "number") setLivePurchases(p.total_purchases)

    if (changed) {
      setShowCheck(true)
      setTimeout(() => setShowCheck(false), 2400)
    }
  }

  const refetch = async () => {
    try {
      const res = await fetch(`/api/loyalty/${loyaltyCode}`, { cache: "no-store" })
      if (!res.ok) return
      applyUpdate((await res.json()) as LoyaltyUpdatePayload)
    } catch {
      /* sin conexión */
    }
  }

  // Realtime instantáneo (broadcast desde el Punto de Venta) + refetch al
  // volver a la pestaña. Todo protegido para no romper nunca el render.
  useEffect(() => {
    if (!supabase) return
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null

    try {
      channel = supabase
        .channel(loyaltyChannelName(loyaltyCode))
        .on("broadcast", { event: "points-updated" }, ({ payload }) => {
          applyUpdate(payload as LoyaltyUpdatePayload)
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") console.log("[loyalty] tarjeta suscrita a Realtime ✓")
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
            console.warn("[loyalty] canal Realtime con problemas:", status)
        })
    } catch (e) {
      console.error("[loyalty] error suscribiendo a Realtime:", e)
    }

    const onVisible = () => {
      if (!document.hidden) refetch()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      if (channel) supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loyaltyCode, supabase])

  const accent = settings.card_color || "#D1F366"
  const isStamps = settings.card_type === "stamps"
  const currentStamps = Math.min(liveStamps, settings.stamps_required)
  const completed = isStamps && currentStamps >= settings.stamps_required
  const nextReward = rewards.find((r) => r.points_cost > livePoints)

  return (
    <div className="h-dvh overflow-hidden flex items-center justify-center bg-gradient-to-b from-[#0c0e17] to-[#15161f] text-white px-4 py-6">
      <div className="w-full max-w-md flex flex-col gap-4">
        {/* ── Tarjeta apaisada ── */}
        <motion.div
          initial={{ y: 18, scale: 0.97 }}
          animate={{ y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 230, damping: 22 }}
          className="relative w-full aspect-[1.6/1] rounded-3xl overflow-hidden border shadow-2xl"
          style={{ borderColor: `${accent}55` }}
        >
          {settings.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.cover_image_url}
              alt={businessName}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: `center ${settings.cover_position ?? 50}%` }}
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(120deg, #1C1C28 0%, ${accent}26 100%)` }}
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(100deg, rgba(12,14,23,0.92) 0%, rgba(12,14,23,0.72) 45%, rgba(12,14,23,0.45) 100%)",
            }}
          />

          {/* Destello al recibir una actualización */}
          <AnimatePresence>
            {showCheck && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.25, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1 }}
                className="absolute inset-0 pointer-events-none"
                style={{ background: accent }}
              />
            )}
          </AnimatePresence>

          <div className="relative h-full flex">
            {/* Izquierda */}
            <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                {settings.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={settings.logo_url}
                    alt={businessName}
                    className={
                      settings.logo_fit === "contain"
                        ? "w-11 h-11 rounded-xl object-contain p-1 bg-white shadow-md flex-shrink-0"
                        : "w-11 h-11 rounded-xl object-cover bg-white shadow-md flex-shrink-0"
                    }
                  />
                ) : (
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm shadow-md flex-shrink-0"
                    style={{ backgroundColor: accent, color: "#1C1C28" }}
                  >
                    {businessName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[8px] uppercase tracking-[0.2em] text-white/55 font-semibold">
                    {isStamps ? "Tarjeta de sellos" : "Tarjeta de fidelidad"}
                  </p>
                  <h1 className="text-sm font-black leading-tight truncate">{businessName}</h1>
                </div>
              </div>

              <div className="min-w-0 relative">
                <p className="text-xs text-white/60 truncate">{clientName}</p>
                {isStamps ? (
                  <motion.p
                    key={liveStamps}
                    initial={{ scale: 1 }}
                    animate={flash?.kind === "stamps" ? { scale: [1.25, 1] } : { scale: 1 }}
                    transition={{ type: "spring", stiffness: 320, damping: 14 }}
                    className="text-3xl font-black leading-none mt-0.5"
                    style={{ color: accent }}
                  >
                    {currentStamps}
                    <span className="text-lg text-white/40">/{settings.stamps_required}</span>
                    <span className="text-xs text-white/50 font-bold ml-1.5">sellos</span>
                  </motion.p>
                ) : (
                  <motion.p
                    key={livePoints}
                    initial={{ scale: 1 }}
                    animate={flash?.kind === "points" ? { scale: [1.25, 1] } : { scale: 1 }}
                    transition={{ type: "spring", stiffness: 320, damping: 14 }}
                    className="text-3xl font-black leading-none mt-0.5"
                    style={{ color: accent }}
                  >
                    {livePoints.toLocaleString("es-AR")}
                    <span className="text-xs text-white/50 font-bold ml-1.5">puntos</span>
                  </motion.p>
                )}

                {/* Badge flotante +X */}
                <AnimatePresence>
                  {flash && (
                    <motion.div
                      key={flash.key}
                      initial={{ opacity: 0, y: 8, scale: 0.8 }}
                      animate={{ opacity: 1, y: -22, scale: 1 }}
                      exit={{ opacity: 0, y: -36 }}
                      transition={{ duration: 0.5 }}
                      onAnimationComplete={() => setTimeout(() => setFlash(null), 900)}
                      className="absolute -top-1 left-0 rounded-full px-2.5 py-1 text-xs font-black shadow-lg flex items-center gap-1"
                      style={{ backgroundColor: accent, color: "#1C1C28" }}
                    >
                      <Check className="w-3 h-3" strokeWidth={3} />
                      {flash.kind === "points"
                        ? `+${flash.amount} pts`
                        : `+${flash.amount} sello${flash.amount === 1 ? "" : "s"}`}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <p className="text-[9px] font-mono text-white/35">
                {loyaltyCode.slice(0, 8).toUpperCase()} · UcoBot
              </p>
            </div>

            {/* Derecha: QR */}
            <div className="flex items-center justify-center pr-4 sm:pr-5">
              <div className="relative">
                <motion.div
                  className="absolute rounded-2xl"
                  style={{ inset: -5, background: accent, filter: "blur(14px)" }}
                  animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.97, 1.03, 0.97] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                />
                <div className="relative bg-white rounded-xl p-2 shadow-xl">
                  {cardUrl ? (
                    <QRCode value={cardUrl} size={104} fgColor="#1C1C28" />
                  ) : (
                    <div className="w-[104px] h-[104px] bg-gray-100 rounded animate-pulse" />
                  )}
                  {/* Check de confirmación sobre el QR */}
                  <AnimatePresence>
                    {showCheck && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.4 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.4 }}
                        transition={{ type: "spring", stiffness: 320, damping: 16 }}
                        className="absolute inset-0 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: "rgba(16,185,129,0.92)" }}
                      >
                        <Check className="w-12 h-12 text-white" strokeWidth={3} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Mensaje guía ── */}
        <p className="text-center text-[11px] text-white/50 -mt-1">
          {completed
            ? "🎉 ¡Tarjeta completa! Reclamá tu regalo en el local"
            : `Mostrá el código al pagar para ${isStamps ? "sumar tu sello" : "sumar y canjear puntos"}`}
        </p>

        {/* ── Sellos o premios ── */}
        {isStamps ? (
          <div className="rounded-2xl bg-[#1C1C28] border border-white/10 p-4">
            <div className="grid grid-cols-5 gap-2.5">
              {Array.from({ length: settings.stamps_required }).map((_, i) => {
                const filled = i < currentStamps
                const isNew = newStampRange && i >= newStampRange.from && i < newStampRange.to
                return (
                  <motion.div
                    key={i}
                    initial={{ scale: 0.85 }}
                    animate={
                      isNew
                        ? { scale: [1.9, 0.9, 1], rotate: [-14, 6, 0] }
                        : { scale: 1 }
                    }
                    transition={
                      isNew
                        ? { duration: 0.65, ease: "easeOut" }
                        : { delay: 0.1 + i * 0.03, type: "spring", stiffness: 300, damping: 18 }
                    }
                    className="aspect-square rounded-full flex items-center justify-center text-sm font-black"
                    style={
                      filled
                        ? {
                            backgroundColor: accent,
                            color: "#1C1C28",
                            boxShadow: isNew ? `0 0 0 4px ${accent}55` : "none",
                          }
                        : {
                            backgroundColor: "rgba(255,255,255,0.92)",
                            color: "rgba(28,28,40,0.18)",
                            border: "2px dashed rgba(28,28,40,0.14)",
                          }
                    }
                  >
                    {filled ? "✓" : i + 1}
                  </motion.div>
                )
              })}
            </div>
            <p className="text-center text-xs text-white/70 mt-3">
              Completá los sellos y llevate{" "}
              <span className="font-bold" style={{ color: accent }}>
                {settings.stamp_reward || "tu regalo"}
              </span>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 min-h-0">
            {nextReward && (
              <div className="rounded-2xl bg-[#1C1C28] border border-white/10 p-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-white/70 truncate pr-2">🎯 {nextReward.name}</span>
                  <span className="text-white/50 flex-shrink-0">
                    faltan {(nextReward.points_cost - livePoints).toLocaleString("es-AR")}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: accent }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (livePoints / nextReward.points_cost) * 100)}%` }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                  />
                </div>
              </div>
            )}

            {rewards.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2 px-1">Premios</p>
                <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
                  {rewards.map((reward) => {
                    const unlocked = livePoints >= reward.points_cost
                    return (
                      <div
                        key={reward.id}
                        className="flex-shrink-0 w-32 rounded-xl border p-2.5 transition-colors"
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
          </div>
        )}
      </div>
    </div>
  )
}
