"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { startOfMonth, subMonths } from "date-fns"
import { MultiStepAutomationCreation } from "./multi-step-automation-creation"
import { ClientCreationDialog } from "./client-creation-dialog"
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"

interface DashboardOverviewProps {
  user: User
  profile: any
}

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

const TRIGGER_LABELS: Record<string, string> = {
  birthday: "Cumpleaños",
  inactive_client: "Cliente inactivo",
  new_promotion: "Nueva promoción",
  comment_reply: "Respuesta comentario",
}

const PLATFORM_ICONS: Record<string, string> = {
  whatsapp: "chat",
  instagram: "photo_camera",
  messenger: "forum",
  web: "language",
}

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

function getLeadsTip(clientsGrowth: number, totalClients: number): string {
  if (totalClients === 0) return "Conectá tu primer asistente para empezar a capturar leads."
  if (clientsGrowth >= 30) return `Creciste ${clientsGrowth.toFixed(0)}% este mes. ¡Excelente ritmo!`
  if (clientsGrowth >= 5) return `Tus leads crecen de forma constante.`
  if (clientsGrowth >= 0) return `Crecimiento estable este mes.`
  return `Bajaron ${Math.abs(clientsGrowth).toFixed(0)}% este mes. Revisá tu bot.`
}

interface TopProduct {
  name: string
  quantity: number
  revenue: number
}

export function DashboardOverview({ user, profile }: DashboardOverviewProps) {
  const router = useRouter()
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false)
  const [isAutomationDialogOpen, setIsAutomationDialogOpen] = useState(false)
  const [search, setSearch] = useState("")

  const [stats, setStats] = useState({
    totalClients: 0,
    clientsGrowth: 0,
    activeBots: 0,
    monthlyMessages: 0,
    messagesGrowth: 0,
    activeConversations: 0,
    totalConversations: 0,
    conversationsGrowth: 0,
    botRevenue: 0,
    botRevenueGrowth: 0,
    conversionRate: 0,
    salesFromBot: 0,
    outOfHoursMessages: 0,
    dayMessages: 0,
  })
  const [chartData, setChartData] = useState<{ name: string; value: number }[]>([])
  const [revenueChart, setRevenueChart] = useState<{ name: string; value: number }[]>([])
  const [pendingLeads, setPendingLeads] = useState(0)
  const [peakDay, setPeakDay] = useState<string | null>(null)
  const [activeBotsList, setActiveBotsList] = useState<{ id: string; name: string; platform: string }[]>([])
  const [automationsList, setAutomationsList] = useState<{ id: string; name: string; is_active: boolean; trigger_type: string }[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "F5": e.preventDefault(); router.push("/dashboard/bots"); break
        case "F6": e.preventDefault(); setIsClientDialogOpen(true); break
        case "F7": e.preventDefault(); setIsAutomationDialogOpen(true); break
        case "F8": e.preventDefault(); router.push("/dashboard/chat"); break
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [router])

  const loadDashboardData = async () => {
    try {
      setIsLoading(true)

      const now = new Date()
      const startOfCurrentMonth = startOfMonth(now).toISOString()
      const startOfLastMonth = startOfMonth(subMonths(now, 1)).toISOString()
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

      // Todas las consultas filtran por user_id en el servidor (vía join cuando
      // la tabla no tiene user_id) — nunca pasamos listas gigantes de IDs por URL.
      const [
        totalClientsRes,
        lastMonthClientsRes,
        activeBotsCountRes,
        conversationsRes,
        thisMonthConvRes,
        lastMonthConvRes,
        pendingRes,
        botsListRes,
        automationsRes,
        msgsMonthCountRes,
        msgsLastMonthCountRes,
        msgsMonthRowsRes,
        msgsWeekRowsRes,
        ordersMonthRes,
        ordersLastMonthRes,
      ] = await Promise.allSettled([
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', user.id).lt('created_at', startOfCurrentMonth),
        supabase.from('bots').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
        supabase.from('conversations').select('id, last_message_at').eq('user_id', user.id),
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', startOfCurrentMonth),
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', startOfLastMonth).lt('created_at', startOfCurrentMonth),
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('needs_attention', true),
        supabase.from('bots').select('id, name, platform').eq('user_id', user.id).eq('is_active', true).limit(3),
        supabase.from('automations').select('id, name, is_active, trigger_type').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('messages').select('id, conversations!inner(user_id)', { count: 'exact', head: true }).eq('conversations.user_id', user.id).gte('created_at', startOfCurrentMonth),
        supabase.from('messages').select('id, conversations!inner(user_id)', { count: 'exact', head: true }).eq('conversations.user_id', user.id).gte('created_at', startOfLastMonth).lt('created_at', startOfCurrentMonth),
        supabase.from('messages').select('created_at, conversations!inner(user_id)').eq('conversations.user_id', user.id).gte('created_at', startOfCurrentMonth).limit(10000),
        supabase.from('messages').select('created_at, conversations!inner(user_id)').eq('conversations.user_id', user.id).gte('created_at', sevenDaysAgo).limit(10000),
        supabase.from('orders').select('total_amount, source, conversation_id, items, created_at').eq('user_id', user.id).neq('status', 'cancelled').gte('created_at', startOfCurrentMonth),
        supabase.from('orders').select('total_amount, source').eq('user_id', user.id).neq('status', 'cancelled').gte('created_at', startOfLastMonth).lt('created_at', startOfCurrentMonth),
      ])

      const totalClients = totalClientsRes.status === 'fulfilled' ? (totalClientsRes.value.count || 0) : 0
      const lastMonthClients = lastMonthClientsRes.status === 'fulfilled' ? (lastMonthClientsRes.value.count || 0) : 0
      const activeBots = activeBotsCountRes.status === 'fulfilled' ? (activeBotsCountRes.value.count || 0) : 0
      const userConversations = conversationsRes.status === 'fulfilled' ? (conversationsRes.value.data || []) : []
      const thisMonthConvCount = thisMonthConvRes.status === 'fulfilled' ? (thisMonthConvRes.value.count || 0) : 0
      const lastMonthConvCount = lastMonthConvRes.status === 'fulfilled' ? (lastMonthConvRes.value.count || 0) : 0
      const pendingCount = pendingRes.status === 'fulfilled' ? (pendingRes.value.count || 0) : 0
      const botsList = botsListRes.status === 'fulfilled' ? (botsListRes.value.data || []) : []
      const autosList = automationsRes.status === 'fulfilled' ? (automationsRes.value.data || []) : []
      const monthlyMessages = msgsMonthCountRes.status === 'fulfilled' ? (msgsMonthCountRes.value.count || 0) : 0
      const lastMonthMessages = msgsLastMonthCountRes.status === 'fulfilled' ? (msgsLastMonthCountRes.value.count || 0) : 0
      const monthMsgRows = msgsMonthRowsRes.status === 'fulfilled' ? (msgsMonthRowsRes.value.data || []) : []
      const weekMsgRows = msgsWeekRowsRes.status === 'fulfilled' ? (msgsWeekRowsRes.value.data || []) : []
      const ordersMonth = ordersMonthRes.status === 'fulfilled' ? (ordersMonthRes.value.data || []) : []
      const ordersLastMonth = ordersLastMonthRes.status === 'fulfilled' ? (ordersLastMonthRes.value.data || []) : []

      const activeConversations = userConversations.filter((c: any) => c.last_message_at && c.last_message_at >= oneDayAgo).length
      const clientsGrowth = lastMonthClients > 0 ? (totalClients - lastMonthClients) / lastMonthClients * 100 : 0
      const conversationsGrowth = lastMonthConvCount > 0 ? (thisMonthConvCount - lastMonthConvCount) / lastMonthConvCount * 100 : 0
      const messagesGrowth = lastMonthMessages > 0 ? (monthlyMessages - lastMonthMessages) / lastMonthMessages * 100 : 0

      // Gráfico semanal de mensajes
      const weeklyChart = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(now)
        date.setDate(date.getDate() - (6 - i))
        const dateStr = date.toISOString().split('T')[0]
        return { name: DAY_NAMES[date.getDay()], value: weekMsgRows.filter((m: any) => m.created_at.startsWith(dateStr)).length }
      })
      const peak = weeklyChart.reduce((a, b) => b.value > a.value ? b : a, weeklyChart[0])

      // Ingresos por bot + serie diaria de los últimos 14 días (bot + pos)
      const botRevenue = ordersMonth
        .filter((o: any) => o.source === 'bot')
        .reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0)
      const botRevenueLast = ordersLastMonth
        .filter((o: any) => o.source === 'bot')
        .reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0)
      const botRevenueGrowth = botRevenueLast > 0 ? (botRevenue - botRevenueLast) / botRevenueLast * 100 : 0

      const dailyRevenue = Array.from({ length: 14 }, (_, i) => {
        const date = new Date(now)
        date.setDate(date.getDate() - (13 - i))
        const dateStr = date.toISOString().split('T')[0]
        const value = ordersMonth
          .filter((o: any) => o.created_at.startsWith(dateStr))
          .reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0)
        return { name: String(date.getDate()), value }
      })

      // Conversión: conversaciones del mes que generaron al menos un pedido
      const salesFromBot = new Set(
        ordersMonth.map((o: any) => o.conversation_id).filter(Boolean)
      ).size
      const conversionRate = thisMonthConvCount > 0 ? (salesFromBot / thisMonthConvCount) * 100 : 0

      // Mensajes fuera de horario (21:00 a 09:00, hora local)
      const outOfHoursMessages = monthMsgRows.filter((m: any) => {
        const h = new Date(m.created_at).getHours()
        return h >= 21 || h < 9
      }).length

      // Top productos del mes
      const productMap = new Map<string, TopProduct>()
      for (const order of ordersMonth) {
        const items = Array.isArray(order.items) ? order.items : []
        for (const item of items) {
          const name = String(item.name || '').trim()
          if (!name || name.startsWith('🎁')) continue
          const qty = Number(item.quantity || 1)
          const revenue = Number(item.subtotal ?? (Number(item.price || 0) * qty))
          const existing = productMap.get(name)
          if (existing) {
            existing.quantity += qty
            existing.revenue += revenue
          } else {
            productMap.set(name, { name, quantity: qty, revenue })
          }
        }
      }
      const topProductsList = Array.from(productMap.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5)

      setStats({
        totalClients, clientsGrowth, activeBots, monthlyMessages, messagesGrowth,
        activeConversations, totalConversations: userConversations.length, conversationsGrowth,
        botRevenue, botRevenueGrowth, conversionRate, salesFromBot, outOfHoursMessages,
        dayMessages: monthMsgRows.length - outOfHoursMessages,
      })
      setChartData(weeklyChart)
      setRevenueChart(dailyRevenue)
      setPeakDay(peak?.value > 0 ? peak.name : null)
      setPendingLeads(pendingCount)
      setActiveBotsList(botsList)
      setAutomationsList(autosList)
      setTopProducts(topProductsList)

    } catch (error) {
      console.error("Error fetching dashboard data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
    // Red de seguridad: nunca dejar el spinner colgado más de 12 segundos
    const safety = setTimeout(() => setIsLoading(false), 12000)
    return () => clearTimeout(safety)
  }, [user.id])

  // Buscador de métricas: cada tile declara sus palabras clave
  const matches = (keywords: string) => {
    const q = search.trim().toLowerCase()
    return !q || keywords.toLowerCase().includes(q)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#D1F366]" />
      </div>
    )
  }

  const maxProductQty = topProducts.length > 0 ? topProducts[0].quantity : 1
  const nightPct = stats.dayMessages + stats.outOfHoursMessages > 0
    ? Math.round((stats.outOfHoursMessages / (stats.dayMessages + stats.outOfHoursMessages)) * 100)
    : 0
  // Anillo de conversión (SVG)
  const ringRadius = 52
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringOffset = ringCircumference * (1 - Math.min(stats.conversionRate, 100) / 100)

  return (
    <div>
      {/* Header — greeting + search */}
      <header className="flex justify-between items-center mb-6 px-4">
        <div>
          <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            ¡Hola, {profile?.business_name || "emprendedor"}! <span className="text-2xl">👋</span>
          </h2>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] font-medium mt-0.5">
            Aquí tienes el estado actual de tu negocio.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative hidden lg:block">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-lg">search</span>
            <input
              className="pl-11 pr-4 py-2.5 rounded-2xl border-none bg-white dark:bg-[#1E1E2E] shadow-sm focus:ring-2 focus:ring-[#D1F366] w-64 text-sm"
              placeholder="Buscar métrica..."
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </header>

      {/* ============== BENTO GRID ============== */}
      <div className="px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 auto-rows-[minmax(0,auto)]">

          {/* ── Tile destacado: Ingresos del Bot con gráfico diario ── */}
          {matches("ingresos del bot ventas dinero facturacion plata revenue") && (
          <div className="sm:col-span-2 lg:col-span-2 lg:row-span-2 executive-card flex flex-col bg-gradient-to-br from-[#D1F366]/[0.07] via-transparent to-transparent">
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 bg-[#D1F366]/15 rounded-2xl flex items-center justify-center text-[#D1F366]">
                <span className="material-symbols-outlined text-2xl">smart_toy</span>
              </div>
              {stats.botRevenueGrowth !== 0 && (
                <span className={cn(
                  "text-[11px] font-bold px-2 py-1 rounded-lg",
                  stats.botRevenueGrowth >= 0 ? "text-emerald-500 bg-emerald-500/10" : "text-red-500 bg-red-500/10"
                )}>
                  {stats.botRevenueGrowth >= 0 ? "+" : ""}{stats.botRevenueGrowth.toFixed(1)}% vs mes ant.
                </span>
              )}
            </div>
            <h3 className="text-[#64748B] dark:text-[#94A3B8] text-xs font-semibold uppercase tracking-wider mt-4">Ingresos del Bot</h3>
            <p className="text-4xl font-black mt-1">{currencyFmt.format(stats.botRevenue)}</p>
            <p className="text-[11px] text-[#64748B] mt-1 mb-4">
              {stats.botRevenue > 0
                ? "Ventas concretadas por tu asistente este mes, sin intervención humana."
                : "Cuando tu bot tome pedidos, acá vas a ver la plata que te genera."}
            </p>
            <div className="flex-1 min-h-[150px] -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueChart} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 600, fill: '#94A3B8' }} interval={1} />
                  <Tooltip
                    formatter={(value: number) => [currencyFmt.format(value), "Ventas"]}
                    labelFormatter={(label: string) => `Día ${label}`}
                    cursor={{ fill: "rgba(148,163,184,0.08)" }}
                    contentStyle={chartTooltipStyle}
                    itemStyle={{ color: '#D1F366' }}
                    labelStyle={{ color: '#94A3B8', fontSize: '10px' }}
                  />
                  <Bar dataKey="value" fill="#D1F366" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-[#64748B] text-center mt-2">Ventas por día · últimos 14 días (todos los canales)</p>
          </div>
          )}

          {/* ── Conversión del Bot: anillo ── */}
          {matches("conversion tasa ventas pedidos efectividad") && (
          <div className="executive-card flex flex-col items-center justify-center text-center lg:row-span-2 py-6">
            <h3 className="text-[#64748B] dark:text-[#94A3B8] text-xs font-semibold uppercase tracking-wider mb-4">Conversión del Bot</h3>
            <div className="relative w-[130px] h-[130px]">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r={ringRadius} fill="none" strokeWidth="10" className="stroke-gray-100 dark:stroke-white/10" />
                <circle
                  cx="60" cy="60" r={ringRadius} fill="none" strokeWidth="10" strokeLinecap="round"
                  stroke="#D1F366"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  style={{ transition: "stroke-dashoffset 0.8s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-black leading-none">{stats.conversionRate.toFixed(0)}%</p>
                <p className="text-[9px] text-[#64748B] uppercase tracking-wider mt-1">convierte</p>
              </div>
            </div>
            <p className="text-[11px] text-[#64748B] mt-4 leading-relaxed px-2">
              {stats.salesFromBot > 0
                ? `${stats.salesFromBot} de las conversaciones de este mes terminaron en pedido.`
                : "Conversaciones que terminan en un pedido."}
            </p>
          </div>
          )}

          {/* ── Fuera de horario: día vs noche ── */}
          {matches("fuera de horario nocturno mientras dormias noche dia") && (
          <div className="executive-card lg:row-span-2 flex flex-col py-6">
            <div className="w-11 h-11 bg-indigo-100 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center text-indigo-400 mb-4">
              <span className="material-symbols-outlined text-xl">bedtime</span>
            </div>
            <h3 className="text-[#64748B] dark:text-[#94A3B8] text-xs font-semibold uppercase tracking-wider">Fuera de Horario</h3>
            <p className="text-3xl font-black mt-1">{stats.outOfHoursMessages.toLocaleString()}</p>
            <p className="text-[11px] text-[#64748B] mt-1">mensajes entre 21 y 9 hs este mes</p>

            <div className="mt-auto pt-5 space-y-3">
              <div>
                <div className="flex justify-between text-[10px] font-bold text-[#64748B] mb-1">
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-xs">light_mode</span> Día</span>
                  <span>{stats.dayMessages.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${100 - nightPct}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] font-bold text-[#64748B] mb-1">
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-xs">dark_mode</span> Noche</span>
                  <span>{stats.outOfHoursMessages.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                  <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${nightPct}%` }} />
                </div>
              </div>
              <p className="text-[10px] text-[#64748B] italic pt-1">
                {nightPct > 0 ? `El ${nightPct}% de tu atención sucede mientras descansás.` : "Tu bot atiende 24/7, incluso de noche."}
              </p>
            </div>
          </div>
          )}

          {/* ── KPIs compactos ── */}
          {matches("leads generados clientes nuevos contactos") && (
          <div className="executive-card group hover:translate-y-[-2px] transition-transform">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-[#D1F366]/10 rounded-xl flex items-center justify-center text-[#D1F366]">
                <span className="material-symbols-outlined text-xl">person_add</span>
              </div>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-lg",
                stats.clientsGrowth >= 0 ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10"
              )}>
                {stats.clientsGrowth >= 0 ? "+" : ""}{stats.clientsGrowth.toFixed(1)}%
              </span>
            </div>
            <h3 className="text-[#64748B] dark:text-[#94A3B8] text-[11px] font-semibold uppercase tracking-wider">Leads Generados</h3>
            <p className="text-2xl font-black mt-0.5">{stats.totalClients.toLocaleString()}</p>
            <p className="text-[10px] text-[#64748B] mt-2 leading-relaxed">{getLeadsTip(stats.clientsGrowth, stats.totalClients)}</p>
          </div>
          )}

          {matches("interacciones mensajes actividad chat") && (
          <div className="executive-card group hover:translate-y-[-2px] transition-transform">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-blue-500">
                <span className="material-symbols-outlined text-xl">chat_bubble</span>
              </div>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-lg",
                stats.messagesGrowth >= 0 ? "text-blue-500 bg-blue-500/10" : "text-red-500 bg-red-500/10"
              )}>
                {stats.messagesGrowth >= 0 ? "+" : ""}{stats.messagesGrowth.toFixed(1)}%
              </span>
            </div>
            <h3 className="text-[#64748B] dark:text-[#94A3B8] text-[11px] font-semibold uppercase tracking-wider">Interacciones</h3>
            <p className="text-2xl font-black mt-0.5">{stats.monthlyMessages.toLocaleString()}</p>
            <p className="text-[10px] text-[#64748B] mt-2 leading-relaxed">
              {peakDay ? `Tu día más activo fue el ${peakDay}.` : "Mensajes de este mes."}
            </p>
          </div>
          )}

          {/* ── Rendimiento semanal (área) ── */}
          {matches("rendimiento de ia grafico actividad semanal mensajes semana") && (
          <div className="sm:col-span-2 lg:col-span-2 executive-card">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-base font-bold">Actividad Semanal</h3>
                <p className="text-[11px] text-[#64748B] mt-0.5">Mensajes atendidos por la IA</p>
              </div>
              {stats.messagesGrowth !== 0 && (
                <div className={cn(
                  "flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg",
                  stats.messagesGrowth >= 0 ? "text-green-500 bg-green-500/5" : "text-red-500 bg-red-500/5"
                )}>
                  <span className="material-symbols-outlined text-sm">{stats.messagesGrowth >= 0 ? "trending_up" : "trending_down"}</span>
                  <span>{stats.messagesGrowth >= 0 ? "+" : ""}{stats.messagesGrowth.toFixed(1)}%</span>
                </div>
              )}
            </div>
            <div className="relative h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D1F366" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#D1F366" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#94A3B8' }} />
                  <Tooltip contentStyle={chartTooltipStyle} itemStyle={{ color: '#D1F366' }} labelStyle={{ color: '#94A3B8', fontSize: '10px' }} />
                  <Area type="monotone" dataKey="value" stroke="#D1F366" strokeWidth={3} fill="url(#colorValue)" dot={false} activeDot={{ r: 6, fill: '#D1F366', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          )}

          {/* ── Top productos con barras ── */}
          {matches("top productos vendidos catalogo mas vendido") && (
          <div className="sm:col-span-2 lg:col-span-2 executive-card">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-base font-bold">Top Productos</h3>
                <p className="text-[11px] text-[#64748B] mt-0.5">Los más vendidos este mes</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-[#D1F366]/10 flex items-center justify-center text-[#D1F366]">
                <span className="material-symbols-outlined text-lg">trophy</span>
              </div>
            </div>
            {topProducts.length === 0 ? (
              <div className="text-center py-8 text-[#64748B] text-xs">
                <span className="material-symbols-outlined text-2xl block mb-2 opacity-30">shopping_bag</span>
                Sin ventas registradas este mes
              </div>
            ) : (
              <div className="space-y-3">
                {topProducts.map((product, idx) => (
                  <div key={product.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <p className="font-semibold truncate pr-2">
                        <span className={cn("font-black mr-1.5", idx === 0 ? "text-[#D1F366]" : "text-[#64748B]")}>{idx + 1}.</span>
                        {product.name}
                      </p>
                      <p className="font-bold flex-shrink-0">
                        {product.quantity} u. · {currencyFmt.format(product.revenue)}
                      </p>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", idx === 0 ? "bg-[#D1F366]" : "bg-[#D1F366]/40")}
                        style={{ width: `${Math.max(6, (product.quantity / maxProductQty) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* ── Cierres de venta compacto ── */}
          {matches("cierres de venta conversaciones activas atencion pendientes") && (
          <div className="executive-card group hover:translate-y-[-2px] transition-transform">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/20 rounded-xl flex items-center justify-center text-orange-500">
                <span className="material-symbols-outlined text-xl">payments</span>
              </div>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-lg",
                stats.conversationsGrowth >= 0 ? "text-orange-500 bg-orange-500/10" : "text-red-500 bg-red-500/10"
              )}>
                {stats.conversationsGrowth >= 0 ? "+" : ""}{stats.conversationsGrowth.toFixed(1)}%
              </span>
            </div>
            <h3 className="text-[#64748B] dark:text-[#94A3B8] text-[11px] font-semibold uppercase tracking-wider">Conversaciones Activas</h3>
            <p className="text-2xl font-black mt-0.5">{stats.activeConversations}</p>
            <p className="text-[10px] text-[#64748B] mt-2 leading-relaxed">
              {pendingLeads > 0
                ? `${pendingLeads} requieren tu atención ahora.`
                : "Últimas 24 horas. Todo en orden."}
            </p>
          </div>
          )}

          {/* ── Asistentes activos compacto ── */}
          {matches("asistentes activos bots operativos") && (
          <div className="executive-card">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[#64748B] dark:text-[#94A3B8] text-[11px] font-semibold uppercase tracking-wider">Asistentes</h3>
              <Link href="/dashboard/bots" className="text-[10px] font-bold text-gray-400 hover:text-[#D1F366] transition-colors uppercase">
                Ver todos
              </Link>
            </div>
            <div className="space-y-2">
              {activeBotsList.length === 0 ? (
                <div className="text-center py-4 text-[#64748B] text-xs">
                  <span className="material-symbols-outlined text-xl block mb-1 opacity-30">smart_toy</span>
                  Sin asistentes activos
                </div>
              ) : activeBotsList.map(bot => (
                <Link key={bot.id} href="/dashboard/bots" className="flex items-center gap-2.5 p-2 bg-gray-50 dark:bg-white/5 rounded-xl group cursor-pointer hover:bg-[#D1F366]/5 transition-all">
                  <div className="w-8 h-8 rounded-lg bg-[#D1F366]/20 flex items-center justify-center text-[#D1F366] flex-shrink-0">
                    <span className="material-symbols-outlined text-base">{PLATFORM_ICONS[bot.platform] || "support_agent"}</span>
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs truncate">{bot.name}</h4>
                    <p className="text-[9px] text-gray-400 capitalize">{bot.platform}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
          )}

          {/* ── Automatizaciones (ancho completo) ── */}
          {matches("automatizaciones criticas flujos") && (
          <section className="sm:col-span-2 lg:col-span-4 executive-card overflow-hidden">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold">Automatizaciones Críticas</h3>
              <button className="w-8 h-8 rounded-full bg-[#1C1C28] text-[#D1F366] flex items-center justify-center hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-lg">bolt</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-gray-100 dark:border-white/5">
                  <tr className="text-[10px] text-[#64748B] font-bold uppercase tracking-widest">
                    <th className="pb-3">Flujo</th>
                    <th className="pb-3">Estado</th>
                    <th className="pb-3 text-right">Impacto</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {automationsList.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-[#64748B] text-xs">
                        No hay automatizaciones creadas aún
                      </td>
                    </tr>
                  ) : automationsList.map((auto, idx) => (
                    <tr key={auto.id} className={idx < automationsList.length - 1 ? "border-b border-gray-50 dark:border-white/5" : ""}>
                      <td className="py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-[#D1F366]/10 text-[#D1F366] flex items-center justify-center">
                            <span className="material-symbols-outlined text-sm">bolt</span>
                          </div>
                          <span className="font-semibold text-xs truncate max-w-[160px]">{auto.name}</span>
                        </div>
                      </td>
                      <td className="py-3.5">
                        <span className={cn(
                          "px-2 py-0.5 text-[9px] font-black rounded-md uppercase",
                          auto.is_active ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400"
                        )}>
                          {auto.is_active ? "Activo" : "Pausado"}
                        </span>
                      </td>
                      <td className="py-3.5 text-right font-bold text-xs text-[#64748B]">
                        {TRIGGER_LABELS[auto.trigger_type] || auto.trigger_type}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          )}

        </div>
      </div>

      {/* Dialogs */}
      <ClientCreationDialog isOpen={isClientDialogOpen} onClose={() => setIsClientDialogOpen(false)} onClientCreated={() => { setIsClientDialogOpen(false); loadDashboardData() }} userId={user.id} />
      <MultiStepAutomationCreation isOpen={isAutomationDialogOpen} onClose={() => setIsAutomationDialogOpen(false)} onAutomationCreated={() => { setIsAutomationDialogOpen(false); loadDashboardData() }} userId={user.id} />
    </div>
  )
}
