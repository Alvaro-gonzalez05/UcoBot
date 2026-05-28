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
import { toast } from "sonner"

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
  web: "language",
}

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

interface BusinessInfoData {
  business_name: string
  business_type: string
  description: string
  address: string
  phone: string
  email: string
  website: string
  menu_link: string
  opening_hours: {
    monday: { isOpen: boolean; open: string; close: string }
    tuesday: { isOpen: boolean; open: string; close: string }
    wednesday: { isOpen: boolean; open: string; close: string }
    thursday: { isOpen: boolean; open: string; close: string }
    friday: { isOpen: boolean; open: string; close: string }
    saturday: { isOpen: boolean; open: string; close: string }
    sunday: { isOpen: boolean; open: string; close: string }
  }
  social_media: {
    facebook?: string
    instagram?: string
    twitter?: string
    whatsapp?: string
  }
}

export function DashboardOverview({ user, profile }: DashboardOverviewProps) {
  const router = useRouter()
  const [isBotDialogOpen, setIsBotDialogOpen] = useState(false)
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false)
  const [isAutomationDialogOpen, setIsAutomationDialogOpen] = useState(false)

  // Business form state (Migrated from BusinessInfo)
  const [activeTab, setActiveTab] = useState<"general" | "contacto" | "redes" | "horarios">("general")
  const [isSavingBusiness, setIsSavingBusiness] = useState(false)
  const [businessInfo, setBusinessInfo] = useState<BusinessInfoData>({
    business_name: "",
    business_type: "",
    description: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    menu_link: "",
    opening_hours: {
      monday: { isOpen: false, open: "09:00", close: "18:00" },
      tuesday: { isOpen: false, open: "09:00", close: "18:00" },
      wednesday: { isOpen: false, open: "09:00", close: "18:00" },
      thursday: { isOpen: false, open: "09:00", close: "18:00" },
      friday: { isOpen: false, open: "09:00", close: "18:00" },
      saturday: { isOpen: false, open: "09:00", close: "14:00" },
      sunday: { isOpen: false, open: "10:00", close: "14:00" },
    },
    social_media: {},
  })

  const [stats, setStats] = useState({
    totalClients: 0,
    clientsGrowth: 0,
    activeBots: 0,
    monthlyMessages: 0,
    messagesGrowth: 0,
    activeConversations: 0,
    totalConversations: 0,
    conversationsGrowth: 0,
  })
  const [chartData, setChartData] = useState<{ name: string; value: number }[]>([])
  const [pendingLeads, setPendingLeads] = useState(0)
  const [peakDay, setPeakDay] = useState<string | null>(null)
  const [activeBotsList, setActiveBotsList] = useState<{ id: string; name: string; platform: string }[]>([])
  const [automationsList, setAutomationsList] = useState<{ id: string; name: string; is_active: boolean; trigger_type: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  const dayLabels = {
    monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles",
    thursday: "Jueves", friday: "Viernes", saturday: "Sábado", sunday: "Domingo"
  }
  const orderedDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

  const businessTypes = [
    "Restaurante", "Tienda de Ropa", "Salón de Belleza", "Gimnasio",
    "Consultorio Médico", "Agencia de Viajes", "Inmobiliaria", "Educación",
    "Tecnología", "Servicios Financieros", "E-commerce", "Otro",
  ]

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

      // ── Round 1: all independent queries in parallel ──
      const [
        profileRes,
        totalClientsRes,
        lastMonthClientsRes,
        activeBotsCountRes,
        conversationsRes,
        thisMonthConvRes,
        lastMonthConvRes,
        pendingRes,
        botsListRes,
        automationsRes,
      ] = await Promise.allSettled([
        supabase.from("user_profiles").select("business_info").eq("id", user.id).single(),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', user.id).lt('created_at', startOfCurrentMonth),
        supabase.from('bots').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
        supabase.from('conversations').select('id, last_message_at').eq('user_id', user.id),
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', startOfCurrentMonth),
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', startOfLastMonth).lt('created_at', startOfCurrentMonth),
        supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('needs_attention', true),
        supabase.from('bots').select('id, name, platform').eq('user_id', user.id).eq('is_active', true).limit(3),
        supabase.from('automations').select('id, name, is_active, trigger_type').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      ])

      // Business info
      const profileData = profileRes.status === 'fulfilled' ? profileRes.value.data : null
      if (profileData?.business_info) {
        setBusinessInfo(prev => ({
          ...profileData.business_info,
          social_media: profileData.business_info.social_media || {},
          opening_hours: typeof profileData.business_info.opening_hours === "string"
            ? prev.opening_hours
            : profileData.business_info.opening_hours || prev.opening_hours,
        }))
      }

      // Extract values safely
      const totalClients = totalClientsRes.status === 'fulfilled' ? (totalClientsRes.value.count || 0) : 0
      const lastMonthClients = lastMonthClientsRes.status === 'fulfilled' ? (lastMonthClientsRes.value.count || 0) : 0
      const activeBots = activeBotsCountRes.status === 'fulfilled' ? (activeBotsCountRes.value.count || 0) : 0
      const userConversations = conversationsRes.status === 'fulfilled' ? (conversationsRes.value.data || []) : []
      const thisMonthConvCount = thisMonthConvRes.status === 'fulfilled' ? (thisMonthConvRes.value.count || 0) : 0
      const lastMonthConvCount = lastMonthConvRes.status === 'fulfilled' ? (lastMonthConvRes.value.count || 0) : 0
      const pendingCount = pendingRes.status === 'fulfilled' ? (pendingRes.value.count || 0) : 0
      const botsList = botsListRes.status === 'fulfilled' ? (botsListRes.value.data || []) : []
      const automationsList = automationsRes.status === 'fulfilled' ? (automationsRes.value.data || []) : []

      const conversationIds = userConversations.map((c: any) => c.id)
      const activeConversations = userConversations.filter((c: any) => c.last_message_at && c.last_message_at >= oneDayAgo).length
      const clientsGrowth = lastMonthClients > 0 ? (totalClients - lastMonthClients) / lastMonthClients * 100 : 0
      const conversationsGrowth = lastMonthConvCount > 0 ? (thisMonthConvCount - lastMonthConvCount) / lastMonthConvCount * 100 : 0

      // ── Round 2: queries that depend on conversationIds ──
      let monthlyMessages = 0, lastMonthMessages = 0
      let weeklyChart: { name: string; value: number }[] = []

      if (conversationIds.length > 0) {
        const [currentMsgRes, lastMsgRes, recentMsgRes] = await Promise.allSettled([
          supabase.from('messages').select('*', { count: 'exact', head: true }).in('conversation_id', conversationIds).gte('created_at', startOfCurrentMonth),
          supabase.from('messages').select('*', { count: 'exact', head: true }).in('conversation_id', conversationIds).gte('created_at', startOfLastMonth).lt('created_at', startOfCurrentMonth),
          supabase.from('messages').select('created_at').in('conversation_id', conversationIds).gte('created_at', sevenDaysAgo),
        ])
        monthlyMessages = currentMsgRes.status === 'fulfilled' ? (currentMsgRes.value.count || 0) : 0
        lastMonthMessages = lastMsgRes.status === 'fulfilled' ? (lastMsgRes.value.count || 0) : 0
        const recentMsgs = recentMsgRes.status === 'fulfilled' ? (recentMsgRes.value.data || []) : []

        weeklyChart = Array.from({ length: 7 }, (_, i) => {
          const date = new Date(now)
          date.setDate(date.getDate() - (6 - i))
          const dateStr = date.toISOString().split('T')[0]
          return { name: DAY_NAMES[date.getDay()], value: recentMsgs.filter((m: any) => m.created_at.startsWith(dateStr)).length }
        })
      } else {
        weeklyChart = Array.from({ length: 7 }, (_, i) => {
          const date = new Date(now)
          date.setDate(date.getDate() - (6 - i))
          return { name: DAY_NAMES[date.getDay()], value: 0 }
        })
      }

      const messagesGrowth = lastMonthMessages > 0 ? (monthlyMessages - lastMonthMessages) / lastMonthMessages * 100 : 0
      const peak = weeklyChart.reduce((a, b) => b.value > a.value ? b : a, weeklyChart[0])

      // Commit all state at once
      setStats({ totalClients, clientsGrowth, activeBots, monthlyMessages, messagesGrowth, activeConversations, totalConversations: conversationIds.length, conversationsGrowth })
      setChartData(weeklyChart)
      setPeakDay(peak?.value > 0 ? peak.name : null)
      setPendingLeads(pendingCount)
      setActiveBotsList(botsList)
      setAutomationsList(automationsList)

    } catch (error) {
      console.error("Error fetching dashboard data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadDashboardData() }, [user.id])

  const saveBusinessInfo = async () => {
    try {
      setIsSavingBusiness(true)
      const { error } = await supabase
        .from("user_profiles")
        .upsert({ 
          id: user.id,
          business_name: businessInfo.business_name,
          business_description: businessInfo.description,
          business_hours: businessInfo.opening_hours,
          social_links: businessInfo.social_media,
          location: businessInfo.address,
          menu_link: businessInfo.menu_link,
          business_info: businessInfo 
        })
        .eq("id", user.id)

      if (error) throw error

      toast.success("Negocio actualizado", {
        description: "Tu información se guardó correctamente para la IA.",
        duration: 4000,
      })
    } catch (error) {
      console.error("Error saving business info:", error)
      toast.error("Error al guardar", {
        description: "No se pudo actualizar la información.",
        duration: 4000,
      })
    } finally {
      setIsSavingBusiness(false)
    }
  }

  const updateField = (field: keyof BusinessInfoData, value: any) => {
    setBusinessInfo((prev) => ({ ...prev, [field]: value }))
  }

  const updateSocialMedia = (platform: string, value: string) => {
    setBusinessInfo((prev) => ({
      ...prev,
      social_media: { ...prev.social_media, [platform]: value },
    }))
  }

  const updateOpeningHours = (
    day: keyof typeof businessInfo.opening_hours,
    field: "isOpen" | "open" | "close",
    value: boolean | string,
  ) => {
    setBusinessInfo((prev) => ({
      ...prev,
      opening_hours: {
        ...prev.opening_hours,
        [day]: {
          ...prev.opening_hours[day],
          [field]: value,
        },
      },
    }))
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
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pb-4">
        <div className="flex flex-col xl:flex-row gap-6">

          {/* ============== LEFT COLUMN ============== */}
          <div className="flex-1 space-y-6">

            {/* KPI Cards */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Leads Generados */}
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

              {/* Interacciones */}
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

              {/* Cierres de Venta */}
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
            </section>

            {/* Chart + Assistants */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                      <Tooltip contentStyle={{ backgroundColor: '#1C1C28', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 'bold', padding: '10px' }} itemStyle={{ color: '#D1F366' }} labelStyle={{ color: '#94A3B8', fontSize: '10px' }} />
                      <Area type="monotone" dataKey="value" stroke="#D1F366" strokeWidth={3} fill="url(#colorValue)" dot={false} activeDot={{ r: 6, fill: '#D1F366', stroke: '#fff', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

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
            </div>

            {/* Automatizaciones Críticas */}
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
                            auto.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400"
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
          </div>

          {/* ============== RIGHT COLUMN ============== */}
          <div className="w-full xl:w-[350px] flex-shrink-0 space-y-6">

            {/* Mi Negocio panel */}
            <div className="bg-[#1C1C28] text-white rounded-[2.5rem] shadow-2xl flex flex-col h-[640px] border border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#D1F366]/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2"></div>

              <div className="p-8 pb-4 relative z-10 shrink-0">
                <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mb-5 group hover:border-[#D1F366]/50 transition-colors">
                  <span className="material-symbols-outlined text-3xl text-[#D1F366]">domain</span>
                </div>
                <h3 className="font-bold text-xl mb-1">Mi Negocio</h3>
                <p className="text-[11px] text-gray-400">Completa tu perfil para que la IA aprenda de ti.</p>

                {/* Extended Tabs */}
                <div className="flex gap-4 mt-8 border-b border-white/10 text-[10px] font-bold uppercase tracking-widest overflow-x-auto hide-scrollbar">
                  <button className={cn("pb-3 px-1 whitespace-nowrap", activeTab === "general" ? "tab-active" : "text-gray-500 hover:text-[#D1F366] transition-colors")} onClick={() => setActiveTab("general")}>
                    General
                  </button>
                  <button className={cn("pb-3 px-1 whitespace-nowrap", activeTab === "contacto" ? "tab-active" : "text-gray-500 hover:text-[#D1F366] transition-colors")} onClick={() => setActiveTab("contacto")}>
                    Contacto
                  </button>
                  <button className={cn("pb-3 px-1 whitespace-nowrap", activeTab === "redes" ? "tab-active" : "text-gray-500 hover:text-[#D1F366] transition-colors")} onClick={() => setActiveTab("redes")}>
                    Redes
                  </button>
                  <button className={cn("pb-3 px-1 whitespace-nowrap", activeTab === "horarios" ? "tab-active" : "text-gray-500 hover:text-[#D1F366] transition-colors")} onClick={() => setActiveTab("horarios")}>
                    Horarios
                  </button>
                </div>
              </div>

              <div className="px-8 pt-4 pb-0 flex-1 overflow-y-auto hide-scrollbar relative z-10">
                {/* General tab */}
                {activeTab === "general" && (
                  <form className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Nombre Comercial</label>
                      <input className="w-full bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 px-4 text-white placeholder:text-white/20"
                        placeholder="Ej: Café Central" type="text" value={businessInfo.business_name} onChange={(e) => updateField("business_name", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Industria</label>
                      <select className="w-full bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 px-4 text-white"
                        value={businessInfo.business_type} onChange={(e) => updateField("business_type", e.target.value)}>
                        <option className="bg-[#1C1C28]" value="">Selecciona el tipo</option>
                        {businessTypes.map(t => <option key={t} value={t} className="bg-[#1C1C28]">{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Tu Propuesta de Valor</label>
                      <textarea className="w-full bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 px-4 text-white placeholder:text-white/20 h-24 resize-none"
                        placeholder="¿Qué hace único a tu negocio?" value={businessInfo.description} onChange={(e) => updateField("description", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Sitio Web</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 material-symbols-outlined text-sm">link</span>
                        <input className="w-full pl-9 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 text-white placeholder:text-white/20"
                          placeholder="www.tuweb.com" type="url" value={businessInfo.website} onChange={(e) => updateField("website", e.target.value)} />
                      </div>
                    </div>
                  </form>
                )}

                {/* Contacto tab */}
                {activeTab === "contacto" && (
                  <form className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Email de Atención</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 material-symbols-outlined text-sm">mail</span>
                        <input className="w-full pl-9 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 text-white"
                          placeholder="hola@empresa.com" type="email" value={businessInfo.email} onChange={(e) => updateField("email", e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Teléfono / WhatsApp</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 material-symbols-outlined text-sm">call</span>
                        <input className="w-full pl-9 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 text-white"
                          placeholder="+34 000 000 000" type="tel" value={businessInfo.phone} onChange={(e) => updateField("phone", e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Dirección Principal</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 material-symbols-outlined text-sm">location_on</span>
                        <input className="w-full pl-9 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 text-white"
                          placeholder="Calle Innovación 42" type="text" value={businessInfo.address} onChange={(e) => updateField("address", e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">Catálogo / Menú Link</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 material-symbols-outlined text-sm">import_contacts</span>
                        <input className="w-full pl-9 bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 text-white"
                          placeholder="menu.tuempresa.com" type="text" value={businessInfo.menu_link} onChange={(e) => updateField("menu_link", e.target.value)} />
                      </div>
                    </div>
                  </form>
                )}

                {/* Redes tab */}
                {activeTab === "redes" && (
                  <form className="space-y-4">
                    {["facebook", "instagram", "twitter", "whatsapp"].map((platform) => (
                      <div key={platform}>
                        <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-widest">{platform}</label>
                        <input className="w-full bg-white/5 border border-white/10 rounded-xl text-sm focus:ring-1 focus:ring-[#D1F366] py-2.5 px-4 text-white"
                          placeholder={`https://${platform}.com/tuempresa`} type="text" 
                          value={businessInfo.social_media[platform as keyof typeof businessInfo.social_media] || ""} 
                          onChange={(e) => updateSocialMedia(platform, e.target.value)} />
                      </div>
                    ))}
                  </form>
                )}

                {/* Horarios tab */}
                {activeTab === "horarios" && (
                  <div className="space-y-2.5">
                    {orderedDays.map((day) => {
                      const schedule = businessInfo.opening_hours[day]
                      return (
                        <div key={day} className={cn(
                          "flex items-center justify-between p-3 rounded-xl border transition-all duration-200",
                          schedule.isOpen 
                            ? "bg-white/5 border-white/10" 
                            : "bg-transparent border-transparent opacity-50 grayscale"
                        )}>
                          <label className="flex items-center gap-3 text-sm font-semibold cursor-pointer select-none min-w-[100px]">
                            <div className="relative flex items-center justify-center">
                              <input type="checkbox" checked={schedule.isOpen} onChange={(e) => updateOpeningHours(day, "isOpen", e.target.checked)}
                                className="peer sr-only" />
                              <div className="w-9 h-5 bg-white/10 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#D1F366] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#D1F366] peer-checked:after:bg-[#1C1C28]"></div>
                            </div>
                            <span className={cn("text-xs uppercase tracking-wider", schedule.isOpen ? "text-white" : "text-gray-500")}>
                              {dayLabels[day].substring(0, 3)}
                            </span>
                          </label>

                          <div className="flex-1 flex justify-end">
                            {schedule.isOpen ? (
                              <div className="flex items-center gap-1.5">
                                <input type="time" value={schedule.open} onChange={(e) => updateOpeningHours(day, "open", e.target.value)}
                                  className="w-[72px] bg-[#1C1C28] border border-white/10 hover:border-[#D1F366]/50 focus:border-[#D1F366] rounded-lg text-xs py-1.5 px-2 text-white font-mono text-center transition-colors outline-none" />
                                <span className="text-gray-500 text-xs font-bold">-</span>
                                <input type="time" value={schedule.close} onChange={(e) => updateOpeningHours(day, "close", e.target.value)}
                                  className="w-[72px] bg-[#1C1C28] border border-white/10 hover:border-[#D1F366]/50 focus:border-[#D1F366] rounded-lg text-xs py-1.5 px-2 text-white font-mono text-center transition-colors outline-none" />
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-4 py-1.5">Cerrado</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="p-8 pt-4 relative z-10 shrink-0">
                <button 
                  onClick={saveBusinessInfo}
                  disabled={isSavingBusiness}
                  className="w-full bg-[#D1F366] text-[#1C1C28] font-black text-xs uppercase tracking-widest py-4 rounded-2xl hover:bg-white transition-all shadow-xl shadow-[#D1F366]/5 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSavingBusiness ? <Loader2 className="w-4 h-4 animate-spin" /> : "Actualizar Entidad"}
                </button>
              </div>
            </div>

            {/* Progreso Mensual */}
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
