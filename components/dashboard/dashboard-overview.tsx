"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { startOfMonth, subMonths } from "date-fns"
import { MultiStepBotCreation } from "./multi-step-bot-creation"
import { MultiStepAutomationCreation } from "./multi-step-automation-creation"
import { ClientCreationDialog } from "./client-creation-dialog"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"

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

// Dynamic tip generators — all based on real stats
function getLeadsTip(clientsGrowth: number, totalClients: number): string {
  if (totalClients === 0) return "Conectá tu primer asistente para empezar a capturar leads."
  if (clientsGrowth >= 30) return `Creciste ${clientsGrowth.toFixed(0)}% en leads este mes. ¡Excelente ritmo!`
  if (clientsGrowth >= 5) return `Tus leads crecen de forma constante. Activá automatizaciones para acelerar.`
  if (clientsGrowth >= 0) return `Crecimiento estable este mes. Revisá el flujo de tu bot para mejorarlo.`
  return `Tus leads bajaron ${Math.abs(clientsGrowth).toFixed(0)}% este mes. Revisá el estado de tu bot.`
}

function getMessagesTip(peakDay: string | null, monthlyMessages: number): string {
  if (monthlyMessages === 0) return "Sin mensajes este mes. Verificá que tu asistente esté activo."
  if (peakDay) return `Tu día con más actividad esta semana fue el ${peakDay}.`
  return `${monthlyMessages.toLocaleString()} interacciones registradas este mes.`
}

function getSalesTip(pendingLeads: number, activeConversations: number): string {
  if (pendingLeads > 0) return `${pendingLeads} conversación${pendingLeads > 1 ? "es requieren" : " requiere"} tu atención ahora.`
  if (activeConversations === 0) return "Sin conversaciones activas. Chequeá que tu bot esté conectado."
  return `${activeConversations} conversaciones activas en las últimas 24 h. ¡Todo en orden!`
}

function getProgressQuote(messagesGrowth: number, businessName: string): string {
  const name = businessName || "emprendedor"
  if (messagesGrowth > 20) return `¡Excelente, ${name}! Tus interacciones crecieron un ${messagesGrowth.toFixed(0)}% este mes.`
  if (messagesGrowth > 0) return `Bien, ${name}. Tu actividad creció un ${messagesGrowth.toFixed(0)}% respecto al mes pasado.`
  if (messagesGrowth < 0) return `${name}, podés reactivar clientes con una campaña de mensajes masivos.`
  return `Primer mes activo, ${name}. ¡Cada conversación cuenta para crecer!`
}

interface TopProduct {
  name: string
  quantity: number
  revenue: number
}

export function DashboardOverview({ user, profile }: DashboardOverviewProps) {
  const router = useRouter()
  const [isBotDialogOpen, setIsBotDialogOpen] = useState(false)
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
  })
  const [chartData, setChartData] = useState<{ name: string; value: number }[]>([])
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
        case "F5": e.preventDefault(); setIsBotDialogOpen(true); break
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

      // Extract values safely
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

      // ── Métricas nuevas ──────────────────────────────────────────────────
      // Ingresos generados por el bot
      const botRevenue = ordersMonth
        .filter((o: any) => o.source === 'bot')
        .reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0)
      const botRevenueLast = ordersLastMonth
        .filter((o: any) => o.source === 'bot')
        .reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0)
      const botRevenueGrowth = botRevenueLast > 0 ? (botRevenue - botRevenueLast) / botRevenueLast * 100 : 0

      // Conversión: conversaciones del mes que generaron al menos un pedido
      const salesFromBot = new Set(
        ordersMonth.map((o: any) => o.conversation_id).filter(Boolean)
      ).size
      const conversionRate = thisMonthConvCount > 0 ? (salesFromBot / thisMonthConvCount) * 100 : 0

      // Mensajes atendidos fuera de horario (21:00 a 09:00, hora local)
      const outOfHoursMessages = monthMsgRows.filter((m: any) => {
        const h = new Date(m.created_at).getHours()
        return h >= 21 || h < 9
      }).length

      // Top productos del mes (desde los items de los pedidos)
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

      // Commit all state at once
      setStats({
        totalClients, clientsGrowth, activeBots, monthlyMessages, messagesGrowth,
        activeConversations, totalConversations: userConversations.length, conversationsGrowth,
        botRevenue, botRevenueGrowth, conversionRate, salesFromBot, outOfHoursMessages,
      })
      setChartData(weeklyChart)
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

  // Buscador de métricas: cada bloque declara sus palabras clave
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

  const progressPercent = stats.totalConversations > 0
    ? Math.min(100, Math.round((stats.activeConversations / stats.totalConversations) * 100))
    : 0

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

      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pb-4">
        <div className="flex flex-col xl:flex-row gap-6">

          {/* ============== LEFT COLUMN ============== */}
          <div className="flex-1 space-y-6">

            {/* KPI Cards — fila 1 */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {matches("leads generados clientes nuevos contactos") && (
              <div className="executive-card group hover:translate-y-[-2px] transition-transform">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-[#D1F366]/10 rounded-2xl flex items-center justify-center text-[#D1F366]">
                    <span className="material-symbols-outlined text-2xl">person_add</span>
                  </div>
                  <span className={cn(
                    "text-[11px] font-bold px-2 py-1 rounded-lg",
                    stats.clientsGrowth >= 0 ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10"
                  )}>
                    {stats.clientsGrowth >= 0 ? "+" : ""}{stats.clientsGrowth.toFixed(1)}%
                  </span>
                </div>
                <h3 className="text-[#64748B] dark:text-[#94A3B8] text-xs font-semibold uppercase tracking-wider">Leads Generados</h3>
                <p className="text-3xl font-black mt-1">{stats.totalClients.toLocaleString()}</p>
                <p className="text-[11px] text-[#64748B] mt-4 leading-relaxed">
                  <span className="text-[#D1F366] font-bold">Tip:</span> {getLeadsTip(stats.clientsGrowth, stats.totalClients)}
                </p>
              </div>
              )}

              {matches("interacciones mensajes actividad chat") && (
              <div className="executive-card group hover:translate-y-[-2px] transition-transform">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-500">
                    <span className="material-symbols-outlined text-2xl">chat_bubble</span>
                  </div>
                  <span className={cn(
                    "text-[11px] font-bold px-2 py-1 rounded-lg",
                    stats.messagesGrowth >= 0 ? "text-blue-500 bg-blue-500/10" : "text-red-500 bg-red-500/10"
                  )}>
                    {stats.messagesGrowth >= 0 ? "+" : ""}{stats.messagesGrowth.toFixed(1)}%
                  </span>
                </div>
                <h3 className="text-[#64748B] dark:text-[#94A3B8] text-xs font-semibold uppercase tracking-wider">Interacciones</h3>
                <p className="text-3xl font-black mt-1">{stats.monthlyMessages.toLocaleString()}</p>
                <p className="text-[11px] text-[#64748B] mt-4 leading-relaxed">
                  <span className="text-blue-500 font-bold">Info:</span> {getMessagesTip(peakDay, stats.monthlyMessages)}
                </p>
              </div>
              )}

              {matches("cierres de venta conversaciones activas atencion") && (
              <div className="executive-card group hover:translate-y-[-2px] transition-transform">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/20 rounded-2xl flex items-center justify-center text-orange-500">
                    <span className="material-symbols-outlined text-2xl">payments</span>
                  </div>
                  <span className={cn(
                    "text-[11px] font-bold px-2 py-1 rounded-lg",
                    stats.conversationsGrowth >= 0 ? "text-orange-500 bg-orange-500/10" : "text-red-500 bg-red-500/10"
                  )}>
                    {stats.conversationsGrowth >= 0 ? "+" : ""}{stats.conversationsGrowth.toFixed(1)}%
                  </span>
                </div>
                <h3 className="text-[#64748B] dark:text-[#94A3B8] text-xs font-semibold uppercase tracking-wider">Cierres de Venta</h3>
                <p className="text-3xl font-black mt-1">{stats.activeConversations}</p>
                <p className="text-[11px] text-[#64748B] mt-4 leading-relaxed">
                  <span className="text-orange-500 font-bold">Tip:</span> {getSalesTip(pendingLeads, stats.activeConversations)}
                </p>
              </div>
              )}
            </section>

            {/* KPI Cards — fila 2: métricas de impacto del bot */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {matches("ingresos del bot ventas dinero facturacion plata revenue") && (
              <div className="executive-card group hover:translate-y-[-2px] transition-transform">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center text-emerald-500">
                    <span className="material-symbols-outlined text-2xl">smart_toy</span>
                  </div>
                  {stats.botRevenueGrowth !== 0 && (
                    <span className={cn(
                      "text-[11px] font-bold px-2 py-1 rounded-lg",
                      stats.botRevenueGrowth >= 0 ? "text-emerald-500 bg-emerald-500/10" : "text-red-500 bg-red-500/10"
                    )}>
                      {stats.botRevenueGrowth >= 0 ? "+" : ""}{stats.botRevenueGrowth.toFixed(1)}%
                    </span>
                  )}
                </div>
                <h3 className="text-[#64748B] dark:text-[#94A3B8] text-xs font-semibold uppercase tracking-wider">Ingresos del Bot</h3>
                <p className="text-3xl font-black mt-1">{currencyFmt.format(stats.botRevenue)}</p>
                <p className="text-[11px] text-[#64748B] mt-4 leading-relaxed">
                  <span className="text-emerald-500 font-bold">Info:</span>{" "}
                  {stats.botRevenue > 0
                    ? "Ventas concretadas por tu asistente este mes, sin intervención humana."
                    : "Cuando tu bot tome pedidos, acá vas a ver la plata que te genera."}
                </p>
              </div>
              )}

              {matches("conversion tasa ventas pedidos efectividad") && (
              <div className="executive-card group hover:translate-y-[-2px] transition-transform">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-2xl flex items-center justify-center text-purple-500">
                    <span className="material-symbols-outlined text-2xl">percent</span>
                  </div>
                </div>
                <h3 className="text-[#64748B] dark:text-[#94A3B8] text-xs font-semibold uppercase tracking-wider">Conversión del Bot</h3>
                <p className="text-3xl font-black mt-1">{stats.conversionRate.toFixed(1)}%</p>
                <p className="text-[11px] text-[#64748B] mt-4 leading-relaxed">
                  <span className="text-purple-500 font-bold">Info:</span>{" "}
                  {stats.salesFromBot > 0
                    ? `${stats.salesFromBot} de las conversaciones de este mes terminaron en pedido.`
                    : "Porcentaje de conversaciones que terminan en un pedido."}
                </p>
              </div>
              )}

              {matches("fuera de horario nocturno mientras dormias 24 horas noche") && (
              <div className="executive-card group hover:translate-y-[-2px] transition-transform">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center text-indigo-500">
                    <span className="material-symbols-outlined text-2xl">bedtime</span>
                  </div>
                </div>
                <h3 className="text-[#64748B] dark:text-[#94A3B8] text-xs font-semibold uppercase tracking-wider">Fuera de Horario</h3>
                <p className="text-3xl font-black mt-1">{stats.outOfHoursMessages.toLocaleString()}</p>
                <p className="text-[11px] text-[#64748B] mt-4 leading-relaxed">
                  <span className="text-indigo-500 font-bold">Info:</span>{" "}
                  {stats.outOfHoursMessages > 0
                    ? "Mensajes atendidos entre las 21 y las 9 hs este mes — tu bot trabaja mientras descansás."
                    : "Mensajes que tu bot atiende entre las 21 y las 9 hs."}
                </p>
              </div>
              )}
            </section>

            {/* Chart + Assistants */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {matches("rendimiento de ia grafico conversiones chatbot semana") && (
              <div className="executive-card">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-lg font-bold">Rendimiento de IA</h3>
                    <p className="text-xs text-[#64748B] mt-1">Conversiones asistidas por Chatbot</p>
                  </div>
                  {stats.messagesGrowth !== 0 && (
                    <div className={cn(
                      "flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-lg",
                      stats.messagesGrowth >= 0 ? "text-green-500 bg-green-500/5" : "text-red-500 bg-red-500/5"
                    )}>
                      <span className="material-symbols-outlined text-sm">{stats.messagesGrowth >= 0 ? "trending_up" : "trending_down"}</span>
                      <span>{stats.messagesGrowth >= 0 ? "+" : ""}{stats.messagesGrowth.toFixed(1)}% vs mes ant.</span>
                    </div>
                  )}
                </div>
                <div className="relative h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#D1F366" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#D1F366" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#94A3B8' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1C1C28', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 'bold', padding: '10px', boxShadow: '0 12px 32px rgba(0,0,0,0.35)' }} itemStyle={{ color: '#D1F366' }} labelStyle={{ color: '#94A3B8', fontSize: '10px' }} />
                      <Area type="monotone" dataKey="value" stroke="#D1F366" strokeWidth={3} fill="url(#colorValue)" dot={false} activeDot={{ r: 6, fill: '#D1F366', stroke: '#fff', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              )}

              {matches("asistentes activos bots operativos") && (
              <div className="executive-card">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-bold">Asistentes Activos</h3>
                    <p className="text-xs text-[#64748B] mt-1">{stats.activeBots} operativos ahora</p>
                  </div>
                  <Link href="/dashboard/bots" className="text-[11px] font-bold text-gray-400 hover:text-[#D1F366] transition-colors uppercase tracking-wider">
                    Ver todos
                  </Link>
                </div>
                <div className="space-y-3">
                  {activeBotsList.length === 0 ? (
                    <div className="text-center py-6 text-[#64748B] text-xs">
                      <span className="material-symbols-outlined text-2xl block mb-2 opacity-30">smart_toy</span>
                      No hay asistentes activos aún
                    </div>
                  ) : activeBotsList.map(bot => (
                    <Link key={bot.id} href="/dashboard/bots" className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-white/5 rounded-2xl group cursor-pointer hover:bg-[#D1F366]/5 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#D1F366]/20 flex items-center justify-center text-[#D1F366]">
                          <span className="material-symbols-outlined text-lg">{PLATFORM_ICONS[bot.platform] || "support_agent"}</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-sm">{bot.name}</h4>
                          <p className="text-[10px] text-gray-400 capitalize">{bot.platform}</p>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-gray-300 group-hover:text-[#D1F366] transition-colors">chevron_right</span>
                    </Link>
                  ))}
                </div>
              </div>
              )}
            </div>

            {/* Automatizaciones Críticas */}
            {matches("automatizaciones criticas flujos") && (
            <section className="executive-card overflow-hidden">
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
                            <span className="font-semibold text-xs truncate max-w-[120px]">{auto.name}</span>
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

          {/* ============== RIGHT COLUMN ============== */}
          <div className="w-full xl:w-[350px] flex-shrink-0 space-y-6">

            {/* Top productos del mes */}
            {matches("top productos vendidos catalogo mas vendido") && (
            <div className="executive-card">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="text-lg font-bold">Top Productos</h3>
                  <p className="text-xs text-[#64748B] mt-1">Los más vendidos este mes</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-[#D1F366]/10 flex items-center justify-center text-[#D1F366]">
                  <span className="material-symbols-outlined text-lg">trophy</span>
                </div>
              </div>
              {topProducts.length === 0 ? (
                <div className="text-center py-6 text-[#64748B] text-xs">
                  <span className="material-symbols-outlined text-2xl block mb-2 opacity-30">shopping_bag</span>
                  Sin ventas registradas este mes
                </div>
              ) : (
                <div className="space-y-3">
                  {topProducts.map((product, idx) => (
                    <div key={product.name} className="flex items-center gap-3">
                      <span className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0",
                        idx === 0 ? "bg-[#D1F366] text-[#1C1C28]" : "bg-gray-100 dark:bg-white/5 text-[#64748B]"
                      )}>
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{product.name}</p>
                        <p className="text-[10px] text-[#64748B]">{product.quantity} vendido{product.quantity === 1 ? "" : "s"}</p>
                      </div>
                      <p className="text-xs font-bold flex-shrink-0">{currencyFmt.format(product.revenue)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Progreso Mensual */}
            {matches("progreso mensual actividad") && (
            <div className="bg-[#D1F366]/10 border border-[#D1F366]/20 p-5 rounded-3xl relative overflow-hidden group">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#B3D93C]">Progreso Mensual</span>
                  <span className="text-xs font-bold">{progressPercent}%</span>
                </div>
                <div className="w-full bg-white dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[#B3D93C] h-full" style={{ width: `${progressPercent}%` }}></div>
                </div>
                <p className="text-[10px] text-[#64748B] dark:text-gray-400 mt-4 leading-relaxed italic">
                  &quot;{getProgressQuote(stats.messagesGrowth, profile?.business_name)}&quot;
                </p>
              </div>
            </div>
            )}
          </div>

        </div>
      </div>

      {/* Dialogs */}
      <MultiStepBotCreation isOpen={isBotDialogOpen} onClose={() => setIsBotDialogOpen(false)} onBotCreated={() => { setIsBotDialogOpen(false); loadDashboardData() }} userId={user.id} />
      <ClientCreationDialog isOpen={isClientDialogOpen} onClose={() => setIsClientDialogOpen(false)} onClientCreated={() => { setIsClientDialogOpen(false); loadDashboardData() }} userId={user.id} />
      <MultiStepAutomationCreation isOpen={isAutomationDialogOpen} onClose={() => setIsAutomationDialogOpen(false)} onAutomationCreated={() => { setIsAutomationDialogOpen(false); loadDashboardData() }} userId={user.id} />
    </div>
  )
}
