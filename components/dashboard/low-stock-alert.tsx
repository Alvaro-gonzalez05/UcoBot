"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface LowStockItem {
  name: string
  quantity: number
  unit: string
  threshold: number
  kind: "supply" | "product"
}

interface Branch {
  userId: string
  branchName: string
  isAdminAccount: boolean
  lowStock: LowStockItem[]
  stockSummary: { itemsTotal: number; lowCount: number; level: number | null; levelWeekAgo: number | null }
}

const fmtQty = (v: number) => {
  const n = Number(v) || 0
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "")
}

/**
 * Dos tiles del Resumen, con el mismo lenguaje visual que el resto del bento:
 *  1) Stock por sucursal: cuántas cosas controla cada local y cuántas faltan.
 *  2) Nivel de stock: qué tan surtido está respecto del mínimo que definió el
 *     negocio, y si subió o bajó contra la semana pasada.
 * Se actualizan solos al vender o ajustar stock.
 */
export function LowStockAlert({ selectedAccount }: { selectedAccount: string }) {
  const [branches, setBranches] = useState<Branch[]>([])
  const supabase = createClient()

  const load = useCallback(async () => {
    try {
      const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const res = await fetch(`/api/negocio/resumen?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date().toISOString())}`)
      if (!res.ok) return setBranches([])
      const j = await res.json()
      setBranches(j.branches || [])
    } catch {
      setBranches([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-low-stock")
      .on("postgres_changes", { event: "*", schema: "public", table: "supplies" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, load])

  const visible = useMemo(
    () =>
      (selectedAccount === "all" ? branches : branches.filter((b) => b.userId === selectedAccount)).filter(
        (b) => (b.stockSummary?.itemsTotal || 0) > 0
      ),
    [branches, selectedAccount]
  )

  if (visible.length === 0) return null

  const totalLow = visible.reduce((acc, b) => acc + (b.stockSummary?.lowCount || 0), 0)

  // Nivel promedio del negocio y comparación con la semana pasada
  const levels = visible.map((b) => b.stockSummary?.level).filter((n): n is number => typeof n === "number")
  const levelsBefore = visible.map((b) => b.stockSummary?.levelWeekAgo).filter((n): n is number => typeof n === "number")
  const level = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : null
  const levelBefore = levelsBefore.length ? Math.round(levelsBefore.reduce((a, b) => a + b, 0) / levelsBefore.length) : null
  const delta = level != null && levelBefore ? Math.round(((level - levelBefore) / levelBefore) * 100) : null

  return (
    <>
      {/* ── Stock por sucursal ── */}
      <section className="sm:col-span-2 lg:col-span-2 executive-card">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-bold">Stock por sucursal</h3>
          <span className="material-symbols-outlined text-[#D1F366]">inventory_2</span>
        </div>
        <p className="mb-4 text-[11px] text-[#64748B]">
          {totalLow === 0
            ? "Todo por encima del mínimo."
            : `${totalLow} ${totalLow === 1 ? "cosa" : "cosas"} para reponer.`}
        </p>

        <div className="space-y-3">
          {visible.map((b) => {
            const s = b.stockSummary
            const ok = Math.max(0, s.itemsTotal - s.lowCount)
            const okPct = s.itemsTotal ? Math.round((ok / s.itemsTotal) * 100) : 100
            return (
              <div key={b.userId}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold">{b.branchName}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {s.lowCount > 0 && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                        {s.lowCount} bajo{s.lowCount === 1 ? "" : "s"}
                      </span>
                    )}
                    <span className="text-[11px] text-[#64748B]">{ok}/{s.itemsTotal}</span>
                    <Link
                      href={b.isAdminAccount ? "/dashboard/stock" : `/dashboard/stock?sucursal=${b.userId}`}
                      className="text-[10px] font-bold uppercase tracking-wide text-gray-400 transition-colors hover:text-[#D1F366]"
                    >
                      Ver
                    </Link>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.06]">
                  <div
                    className={cn("h-full rounded-full transition-all", s.lowCount > 0 ? "bg-amber-400" : "bg-[#D1F366]")}
                    style={{ width: `${okPct}%` }}
                  />
                </div>
                {b.lowStock.length > 0 && (
                  <p className="mt-1 truncate text-[11px] text-[#64748B]">
                    Falta: {b.lowStock.slice(0, 3).map((i) => `${i.name} (${i.quantity <= 0 ? "sin stock" : `${fmtQty(i.quantity)} ${i.unit}`})`).join(" · ")}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Nivel de stock vs lo habitual ── */}
      <section className="executive-card flex flex-col justify-center py-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
            Nivel de stock
          </h3>
          <span className="material-symbols-outlined text-lg text-[#64748B]">monitoring</span>
        </div>

        <p className="text-4xl font-black leading-none">{level != null ? `${level}%` : "—"}</p>
        <p className="mt-1 text-[11px] text-[#64748B]">del mínimo que definiste</p>

        {delta != null && (
          <div className="mt-3 flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold",
                delta < 0 ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-600"
              )}
            >
              <span className="material-symbols-outlined text-[13px]">{delta < 0 ? "trending_down" : "trending_up"}</span>
              {delta > 0 ? "+" : ""}
              {delta}%
            </span>
            <span className="text-[11px] text-[#64748B]">vs. semana pasada</span>
          </div>
        )}

        <p className="mt-3 text-[11px] leading-snug text-[#64748B]">
          {level == null
            ? "Cargá insumos con alerta para medir el nivel."
            : level < 100
              ? "Estás por debajo de tu mínimo: conviene reponer."
              : level < 150
                ? "Justo por encima del mínimo."
                : "Bien surtido."}
        </p>
      </section>
    </>
  )
}
