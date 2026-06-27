"use client"

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

export function TripsChart({ data }: { data: { label: string; value: number }[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 6, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="tripsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
          <Tooltip
            cursor={{ stroke: "hsl(var(--border))" }}
            contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 13 }}
            labelStyle={{ fontWeight: 600 }}
            formatter={(v: number) => [`${v} viajes`, ""]}
          />
          <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#tripsFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
