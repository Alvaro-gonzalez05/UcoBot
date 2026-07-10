"use client"

// Gráficos del panel principal aislados en su propio archivo para poder
// cargarlos con next/dynamic. Así recharts (pesado) NO entra en el bundle
// inicial del dashboard y no traba los celulares de gama baja al abrir.
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"

const currencyFmt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
})

const chartTooltipStyle = {
  backgroundColor: "#1C1C28",
  border: "none",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "12px",
  fontWeight: "bold",
  padding: "10px",
  boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
} as const

export function RevenueBarChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 600, fill: "#94A3B8" }} interval={1} />
        <Tooltip
          formatter={(value: number) => [currencyFmt.format(value), "Ventas"]}
          labelFormatter={(label: string) => `Día ${label}`}
          cursor={{ fill: "rgba(148,163,184,0.08)" }}
          contentStyle={chartTooltipStyle}
          itemStyle={{ color: "#D1F366" }}
          labelStyle={{ color: "#94A3B8", fontSize: "10px" }}
        />
        <Bar dataKey="value" fill="#D1F366" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TrendAreaChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#D1F366" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#D1F366" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: "#94A3B8" }} />
        <Tooltip contentStyle={chartTooltipStyle} itemStyle={{ color: "#D1F366" }} labelStyle={{ color: "#94A3B8", fontSize: "10px" }} />
        <Area type="monotone" dataKey="value" stroke="#D1F366" strokeWidth={3} fill="url(#colorValue)" dot={false} activeDot={{ r: 6, fill: "#D1F366", stroke: "#fff", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
