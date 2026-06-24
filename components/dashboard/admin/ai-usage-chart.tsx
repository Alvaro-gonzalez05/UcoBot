"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export interface AiUsageDay {
  date: string // YYYY-MM-DD
  label: string // dd/mm
  total: number // cantidad de llamadas
  cost: number // USD
  users?: { name: string; count: number }[] // desglose por usuario (para el general)
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null
  const d: AiUsageDay = payload[0].payload
  const users = (d.users || []).slice().sort((a, b) => b.count - a.count).slice(0, 8)
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-lg text-xs min-w-[180px]">
      <p className="font-bold mb-1">{d.label}</p>
      <p className="text-muted-foreground mb-2">
        {d.total} consulta{d.total !== 1 ? "s" : ""} · ${d.cost.toFixed(4)}
      </p>
      {users.length > 0 && (
        <div className="space-y-1 border-t border-border pt-1.5">
          {users.map((u) => (
            <div key={u.name} className="flex items-center justify-between gap-3">
              <span className="truncate max-w-[120px]">{u.name}</span>
              <span className="font-semibold">{u.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AiUsageChart({ data, height = 260 }: { data: AiUsageDay[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="aiUsageFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D1F366" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#D1F366" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="total"
          stroke="#9bbf2e"
          strokeWidth={2}
          fill="url(#aiUsageFill)"
          dot={{ r: 2.5, fill: "#9bbf2e" }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
