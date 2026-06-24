import type { AiUsageDay } from "@/components/dashboard/admin/ai-usage-chart"

interface UsageRow {
  user_id: string | null
  cost_usd: number | string | null
  created_at: string
}

/**
 * Agrupa filas de ai_usage en una serie diaria para el gráfico.
 * Si se pasa `userNameById`, agrega el desglose por usuario (para el tooltip del general).
 */
export function buildDailyUsage(
  rows: UsageRow[],
  days: number,
  userNameById?: Map<string, string>
): AiUsageDay[] {
  const buckets = new Map<string, AiUsageDay>()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    buckets.set(key, {
      date: key,
      label: d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }),
      total: 0,
      cost: 0,
      ...(userNameById ? { users: [] as { name: string; count: number }[] } : {}),
    })
  }

  for (const r of rows) {
    const key = new Date(r.created_at).toISOString().slice(0, 10)
    const b = buckets.get(key)
    if (!b) continue
    b.total += 1
    b.cost += Number(r.cost_usd || 0)
    if (userNameById && b.users) {
      const name = (r.user_id && userNameById.get(r.user_id)) || "Desconocido"
      const existing = b.users.find((u) => u.name === name)
      if (existing) existing.count += 1
      else b.users.push({ name, count: 1 })
    }
  }

  return Array.from(buckets.values())
}
