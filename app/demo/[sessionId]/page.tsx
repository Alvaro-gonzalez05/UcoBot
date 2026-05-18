"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "framer-motion"
import {
  Bot, Send, Plus, Loader2, Paperclip, UserCheck, Tag, Sparkles,
  MessageSquare, Users, Calendar, ShoppingBag, Package, FileText, Zap,
  Menu, X, ArrowRight, LayoutDashboard, CheckCircle2, Clock,
  Play, ToggleLeft, TrendingUp, Globe, Star, AlertCircle, Sun, Moon,
} from "lucide-react"
import Link from "next/link"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"
import { ClientsManagement } from "@/components/dashboard/clients-management"
import { ReservasClient } from "@/components/dashboard/reservas-client"
import { AutomationsManagement } from "@/components/dashboard/automations-management"
import { BotsManagement } from "@/components/dashboard/bots-management"

// ─── Icon map ─────────────────────────────────────────────────────────────────
const SIDEBAR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  MessageSquare, Users, Calendar, ShoppingBag, Package, FileText,
  Zap, Tag, LayoutDashboard, Bot,
}

// ─── Fixed + optional section IDs ─────────────────────────────────────────────
const FIXED_SECTIONS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", visible: true, icon: "LayoutDashboard" },
  { id: "chat", label: "Mensajes", visible: true, icon: "MessageSquare" },
  { id: "bots", label: "Chatbots", visible: true, icon: "Bot" },
  { id: "automations", label: "Automatizaciones", visible: true, icon: "Zap" },
]
const FIXED_SECTION_IDS = new Set(FIXED_SECTIONS.map((s) => s.id))

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface SidebarItem {
  id: string; label: string; visible: boolean; icon: string
}
interface Message {
  id: string; sender_type: "client" | "bot"; content: string; created_at: string
}
interface ChatEvent {
  type: "client_registered" | "lead_tagged"; name?: string; tag?: string
}
interface SuggestedQuestion {
  title: string; description: string
}
interface DemoSession {
  id: string; contact_name: string; business_name: string; bot_name: string
  business_summary: string; features: string[]
  feature_config: Record<string, any>
  suggested_questions: SuggestedQuestion[]
  allowed_tags: string[]; sidebar_config: SidebarItem[]
}

// ─── Tag colors ───────────────────────────────────────────────────────────────
const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  default:       { bg: "bg-violet-500/15", text: "text-violet-300",  border: "border-violet-500/30" },
  inversor:      { bg: "bg-amber-500/15",  text: "text-amber-300",   border: "border-amber-500/30"  },
  comprador:     { bg: "bg-green-500/15",  text: "text-green-300",   border: "border-green-500/30"  },
  "lead frío":   { bg: "bg-blue-500/15",   text: "text-blue-300",    border: "border-blue-500/30"   },
  "lead caliente":{ bg: "bg-red-500/15",   text: "text-red-300",     border: "border-red-500/30"    },
  exploratorio:  { bg: "bg-zinc-500/15",   text: "text-zinc-300",    border: "border-zinc-500/30"   },
}
function getTagColor(tag: string) {
  const lower = tag.toLowerCase()
  for (const key of Object.keys(TAG_COLORS)) {
    if (lower.includes(key)) return TAG_COLORS[key]
  }
  return TAG_COLORS.default
}

function getGreeting() {
  const h = new Date().getHours()
  if (h >= 6 && h < 12) return "Buenos días"
  if (h >= 12 && h < 19) return "Buenas tardes"
  return "Buenas noches"
}

// ─── Chat event animations ────────────────────────────────────────────────────
function ClientRegisteredCard({ name }: { name: string }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.8, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -8 }} transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="flex justify-center my-1">
      <div className="flex items-center gap-2.5 bg-[#CCFF00]/10 border border-[#CCFF00]/25 rounded-full px-4 py-2">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 500 }}
          className="w-6 h-6 rounded-full bg-[#CCFF00]/20 flex items-center justify-center">
          <UserCheck className="w-3.5 h-3.5 text-[#CCFF00]" />
        </motion.div>
        <span className="text-[#CCFF00] text-xs font-medium">
          Cliente registrado · <span className="font-bold">{name}</span>
        </span>
        <motion.div animate={{ rotate: [0, 15, -10, 0] }} transition={{ delay: 0.3, duration: 0.5 }}>
          <Sparkles className="w-3 h-3 text-[#CCFF00]/60" />
        </motion.div>
      </div>
    </motion.div>
  )
}

function LeadTagBadge({ tag }: { tag: string }) {
  const colors = getTagColor(tag)
  return (
    <motion.div initial={{ opacity: 0, x: -20, scale: 0.85 }} animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.85 }} transition={{ type: "spring", stiffness: 380, damping: 24 }}
      className="flex justify-center my-1">
      <div className={`flex items-center gap-2 ${colors.bg} border ${colors.border} rounded-full px-4 py-2`}>
        <motion.div initial={{ rotate: -180, scale: 0 }} animate={{ rotate: 0, scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 450 }}>
          <Tag className={`w-3.5 h-3.5 ${colors.text}`} />
        </motion.div>
        <span className={`text-xs font-medium ${colors.text}`}>
          Lead clasificado como · <span className="font-bold">{tag}</span>
        </span>
      </div>
    </motion.div>
  )
}

function HandoverNotice() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center my-1">
      <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-full px-4 py-2">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-amber-300 text-xs font-medium">Un asesor se va a comunicar pronto</span>
      </div>
    </motion.div>
  )
}

// ─── Demo banner ──────────────────────────────────────────────────────────────
function DemoBanner({ text }: { text: string }) {
  return (
    <div className="mx-6 mt-5 mb-1 bg-[#CCFF00]/5 border border-[#CCFF00]/15 rounded-xl px-4 py-2.5 flex items-start gap-2.5">
      <Sparkles className="w-3.5 h-3.5 text-[#CCFF00]/70 flex-shrink-0 mt-0.5" />
      <p className="text-[#CCFF00]/70 text-xs leading-relaxed">{text}</p>
    </div>
  )
}

// ─── DASHBOARD section (replica del DashboardOverview real) ──────────────────
const DEMO_CHART_DATA = [
  { name: "Lun", value: 18 }, { name: "Mar", value: 32 }, { name: "Mié", value: 27 },
  { name: "Jue", value: 55 }, { name: "Vie", value: 48 }, { name: "Sáb", value: 67 }, { name: "Dom", value: 74 },
]

function DashboardSection({ session }: { session: DemoSession }) {
  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar">
      <DemoBanner text="Vista previa de tu panel con datos de ejemplo. En tu cuenta real los números se actualizan en tiempo real con tus conversaciones." />
      <div className="p-4">
        <header className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              ¡Hola, {session.business_name}! <span>👋</span>
            </h2>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">Aquí tienes el estado actual de tu negocio.</p>
          </div>
        </header>

        <div className="space-y-6">
          {/* KPI Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="executive-card group hover:-translate-y-0.5 transition-transform">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-[#D1F366]/10 rounded-2xl flex items-center justify-center text-[#D1F366]">
                  <span className="material-symbols-outlined text-2xl">person_add</span>
                </div>
                <span className="text-[11px] font-bold px-2 py-1 rounded-lg text-green-500 bg-green-500/10">+12.5%</span>
              </div>
              <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Leads Generados</h3>
              <p className="text-3xl font-black mt-1">8</p>
              <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
                <span className="text-[#D1F366] font-bold">Proyección:</span> Vas camino a superar tu meta mensual en un 15%.
              </p>
            </div>

            <div className="executive-card group hover:-translate-y-0.5 transition-transform">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-500">
                  <span className="material-symbols-outlined text-2xl">chat_bubble</span>
                </div>
                <span className="text-[11px] font-bold px-2 py-1 rounded-lg text-blue-500 bg-blue-500/10">+8.3%</span>
              </div>
              <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Interacciones</h3>
              <p className="text-3xl font-black mt-1">47</p>
              <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
                <span className="text-blue-500 font-bold">Info:</span> El pico de tráfico fue ayer a las 20:00.
              </p>
            </div>

            <div className="executive-card group hover:-translate-y-0.5 transition-transform">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/20 rounded-2xl flex items-center justify-center text-orange-500">
                  <span className="material-symbols-outlined text-2xl">payments</span>
                </div>
                <span className="text-[11px] font-bold px-2 py-1 rounded-lg text-orange-500 bg-orange-500/10">+8.5%</span>
              </div>
              <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Cierres de Venta</h3>
              <p className="text-3xl font-black mt-1">3</p>
              <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
                <span className="text-orange-500 font-bold">Tip:</span> 5 leads están &quot;calientes&quot; esperando seguimiento.
              </p>
            </div>
          </section>

          {/* Chart + Bot activo */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="executive-card">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold">Rendimiento de IA</h3>
                  <p className="text-xs text-muted-foreground mt-1">Conversaciones asistidas esta semana</p>
                </div>
                <div className="flex items-center gap-1 text-green-500 text-[11px] font-bold bg-green-500/5 px-2 py-1 rounded-lg">
                  <span className="material-symbols-outlined text-sm">trending_up</span>
                  Top 5%
                </div>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={DEMO_CHART_DATA}>
                    <defs>
                      <linearGradient id="demoGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#D1F366" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#D1F366" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: "#94A3B8" }} />
                    <Tooltip contentStyle={{ backgroundColor: "#1C1C28", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px", padding: "10px" }} itemStyle={{ color: "#D1F366" }} labelStyle={{ color: "#94A3B8", fontSize: "10px" }} />
                    <Area type="monotone" dataKey="value" stroke="#D1F366" strokeWidth={3} fill="url(#demoGrad)" dot={false} activeDot={{ r: 6, fill: "#D1F366", stroke: "#fff", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="executive-card">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold">Asistentes Activos</h3>
                  <p className="text-xs text-muted-foreground mt-1">1 operativo ahora</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3.5 bg-muted rounded-2xl cursor-pointer hover:bg-[#D1F366]/5 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#D1F366]/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-lg text-[#D1F366]">support_agent</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{session.bot_name}</h4>
                      <p className="text-[10px] text-muted-foreground">{session.business_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#D1F366] animate-pulse" />
                    <span className="text-[10px] text-[#D1F366] font-medium">Activo</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Automatizaciones */}
          <section className="executive-card overflow-hidden">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold">Automatizaciones Activas</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-border">
                  <tr className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                    <th className="pb-3">Flujo</th><th className="pb-3">Estado</th><th className="pb-3 text-right">Impacto</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  <tr className="border-b border-border/50">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-green-100 dark:bg-green-900/20 text-green-600 flex items-center justify-center">
                          <span className="material-symbols-outlined text-sm">waving_hand</span>
                        </div>
                        <span className="font-semibold text-xs">Bienvenida automática</span>
                      </div>
                    </td>
                    <td className="py-3"><span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-[9px] font-black rounded-md uppercase">Activo</span></td>
                    <td className="py-3 text-right font-bold text-xs">+20% Conversión</td>
                  </tr>
                  <tr>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-900/20 text-orange-600 flex items-center justify-center">
                          <span className="material-symbols-outlined text-sm">replay</span>
                        </div>
                        <span className="font-semibold text-xs">Re-engagement de leads</span>
                      </div>
                    </td>
                    <td className="py-3"><span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-[9px] font-black rounded-md uppercase">Activo</span></td>
                    <td className="py-3 text-right font-bold text-xs">+12% Retención</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ─── CHATBOTS section ─────────────────────────────────────────────────────────
function ChatbotsSection({ session }: { session: DemoSession }) {
  const FEATURE_LABELS: Record<string, string> = {
    register_clients: "Registro de clientes", take_orders: "Toma de pedidos",
    manage_appointments: "Agendado de citas", lead_qualification: "Calificación de leads",
    loyalty_points: "Puntos de fidelización", custom_forms: "Formularios conversacionales",
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <DemoBanner text="Este es tu bot configurado por la IA. En tu cuenta podés editar su personalidad, funcionalidades y conectarlo a tus canales." />
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        {/* Bot card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#CCFF00] flex items-center justify-center flex-shrink-0">
                <Bot className="w-6 h-6 text-black" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold">{session.bot_name}</span>
                  <span className="text-[10px] bg-[#CCFF00]/10 text-[#CCFF00] border border-[#CCFF00]/20 px-2 py-0.5 rounded-full font-medium">Configurado con IA</span>
                </div>
                <span className="text-zinc-500 text-xs">{session.business_name}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#CCFF00]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#CCFF00] animate-pulse" />
              Activo
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {session.features.map((f) => (
              <span key={f} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 px-2.5 py-1 rounded-lg">
                {FEATURE_LABELS[f] || f}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 pt-1 border-t border-zinc-800">
            {[["12", "Conversaciones"], ["8", "Clientes"], ["5", "Leads"]].map(([v, l]) => (
              <div key={l} className="text-center">
                <div className="text-white font-bold text-lg">{v}</div>
                <div className="text-zinc-600 text-[10px]">{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Channels */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-white text-sm font-semibold">Canales de integración</h3>
            <p className="text-zinc-600 text-xs mt-0.5">Conectá tu bot a tus canales de comunicación</p>
          </div>
          {[
            { name: "WhatsApp Business", icon: "💬", desc: "Recibí mensajes de WhatsApp automáticamente" },
            { name: "Instagram DMs", icon: "📸", desc: "Respondé consultas de Instagram en piloto automático" },
            { name: "Widget web", icon: "🌐", desc: "Instalá el chat en tu sitio web con un script" },
          ].map((ch) => (
            <div key={ch.name} className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-xl">{ch.icon}</span>
                <div>
                  <p className="text-white text-sm font-medium">{ch.name}</p>
                  <p className="text-zinc-600 text-xs">{ch.desc}</p>
                </div>
              </div>
              <span className="text-xs text-zinc-600 border border-zinc-700 rounded-lg px-2.5 py-1">Activar →</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── AUTOMATIONS section ──────────────────────────────────────────────────────
function AutomationsSection({ session }: { session: DemoSession }) {
  const f = session.features || []
  const fc = session.feature_config || {}
  const appLabel = fc.appointments_label || "cita"

  const automations = [
    { emoji: "👋", name: "Bienvenida automática",         desc: "Saluda a nuevos contactos y presenta al bot cuando escriben por primera vez.",         trigger: "Primer mensaje",              always: true },
    { emoji: "🔁", name: "Re-engagement de leads",         desc: "Si un lead no responde en 7 días, el bot envía un mensaje de reactivación.",           trigger: "Sin respuesta > 7 días",      always: true },
    { emoji: "📅", name: `Recordatorio de ${appLabel}`,    desc: `24 horas antes de una ${appLabel}, el bot envía un recordatorio automático al cliente.`, trigger: `24hs antes de ${appLabel}`,   only: "manage_appointments" },
    { emoji: "✅", name: `Confirmación de ${appLabel}`,    desc: `Después de la ${appLabel}, solicita feedback o próximo paso.`,                          trigger: `Post ${appLabel}`,            only: "manage_appointments" },
    { emoji: "🔥", name: "Alerta de lead caliente",        desc: "Cuando el bot clasifica un lead como caliente, te notifica para que actúes rápido.",    trigger: "Tag: lead caliente",          only: "lead_qualification"  },
    { emoji: "❄️", name: "Seguimiento de lead frío",       desc: "Secuencia de mensajes para reactivar leads que perdieron el interés.",                 trigger: "Tag: lead frío",              only: "lead_qualification"  },
    { emoji: "🛒", name: "Confirmación de pedido",         desc: `Cuando se registra un ${fc.requests_label || "pedido"}, confirma y detalla los pasos.`, trigger: `Nuevo ${fc.requests_label || "pedido"}`, only: "take_orders" },
    { emoji: "⭐", name: "Notificación de puntos",         desc: "Informa al cliente cuando acumula puntos o alcanza un nivel nuevo de fidelización.",    trigger: "Acumulación de puntos",       only: "loyalty_points"      },
    { emoji: "📋", name: "Recordatorio de formulario",     desc: "Si un cliente dejó un formulario sin completar, el bot envía un recordatorio.",         trigger: "Formulario incompleto",       only: "custom_forms"        },
  ]

  const visible = automations.filter((a) => a.always || f.includes(a.only || ""))

  return (
    <div className="flex-1 overflow-y-auto">
      <DemoBanner text="Estas son las automatizaciones disponibles para tu negocio según las funcionalidades configuradas. Podés activarlas y personalizarlas en tu cuenta." />
      <div className="p-6 max-w-3xl mx-auto space-y-3">
        {visible.map((a, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0 text-xl">{a.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white text-sm font-semibold">{a.name}</span>
                {a.always && <span className="text-[10px] bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full">Base</span>}
              </div>
              <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">{a.desc}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <Play className="w-3 h-3 text-zinc-600" />
                <span className="text-zinc-600 text-[11px]">Disparador: {a.trigger}</span>
              </div>
            </div>
            <div className="flex-shrink-0 mt-0.5">
              <ToggleLeft className="w-8 h-8 text-zinc-700" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── CLIENTS section ──────────────────────────────────────────────────────────
function ClientsSection({ session, sectionLabel }: { session: DemoSession; sectionLabel: string }) {
  const clients = [
    { name: "María García",   tag: "lead caliente", time: "Hace 10 min",  email: "mariag@gmail.com",  msgs: 8 },
    { name: "Juan López",     tag: "lead frío",     time: "Hace 2 horas", email: "—",                 msgs: 3 },
    { name: "Carlos Ruiz",    tag: "comprador",     time: "Ayer",         email: "cruiz@empresa.com", msgs: 15 },
    { name: "Ana Martínez",   tag: "exploratorio",  time: "Hace 3 días",  email: "ana.m@gmail.com",   msgs: 5 },
  ]
  return (
    <div className="flex-1 overflow-y-auto">
      <DemoBanner text={`Vista previa de ${sectionLabel}. Cuando tu bot registre clientes reales en conversaciones, aparecerán aquí con todos sus datos.`} />
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">{sectionLabel}</h3>
            <p className="text-zinc-600 text-xs mt-0.5">4 registrados · 2 nuevos esta semana</p>
          </div>
          <span className="text-xs text-zinc-600 border border-zinc-700 rounded-lg px-3 py-1.5">+ Agregar</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800/60">
          {clients.map((c, i) => {
            const colors = getTagColor(c.tag)
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 text-sm font-bold text-zinc-400">
                  {c.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-medium">{c.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${colors.bg} ${colors.text} ${colors.border}`}>{c.tag}</span>
                  </div>
                  <p className="text-zinc-600 text-xs">{c.email}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-zinc-500 text-xs">{c.msgs} mensajes</p>
                  <p className="text-zinc-700 text-[10px]">{c.time}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── RESERVATIONS section ─────────────────────────────────────────────────────
function ReservationsSection({ session, sectionLabel }: { session: DemoSession; sectionLabel: string }) {
  const fc = session.feature_config || {}
  const label = fc.appointments_label || sectionLabel

  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const dayAfter = new Date(); dayAfter.setDate(dayAfter.getDate() + 2)
  const fmt = (d: Date) => d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })

  const items = [
    { client: "María García",  time: "15:00", date: "Hoy",          note: "Primera consulta",   status: "confirmada" },
    { client: "Juan López",    time: "10:00", date: fmt(tomorrow),   note: "Consulta de precios", status: "pendiente"  },
    { client: "Ana Martínez",  time: "16:30", date: fmt(dayAfter),   note: "Segunda visita",     status: "confirmada" },
    { client: "Carlos Ruiz",   time: "09:00", date: fmt(dayAfter),   note: "Cierre de contrato", status: "confirmada" },
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <DemoBanner text={`Vista previa de ${sectionLabel}. Cuando tu bot agende ${label.toLowerCase()}s reales, aparecerán aquí organizadas.`} />
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">{sectionLabel}</h3>
            <p className="text-zinc-600 text-xs mt-0.5">4 próximas</p>
          </div>
          <span className="text-xs text-zinc-600 border border-zinc-700 rounded-lg px-3 py-1.5">+ Nueva</span>
        </div>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 flex items-center gap-4">
              <div className="flex-shrink-0 text-center min-w-[52px]">
                <p className="text-[#CCFF00] text-xs font-bold">{item.date}</p>
                <p className="text-white text-lg font-bold leading-tight">{item.time}</p>
              </div>
              <div className="w-px h-10 bg-zinc-800" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">{item.client}</p>
                <p className="text-zinc-500 text-xs">{item.note}</p>
              </div>
              <span className={`text-[10px] px-2 py-1 rounded-full border flex-shrink-0 font-medium ${
                item.status === "confirmada"
                  ? "bg-green-500/10 text-green-400 border-green-500/25"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/25"
              }`}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── ORDERS section ───────────────────────────────────────────────────────────
function OrdersSection({ session, sectionLabel }: { session: DemoSession; sectionLabel: string }) {
  const fc = session.feature_config || {}
  const reqLabel = fc.requests_label || sectionLabel

  const orders = [
    { id: "#001", client: "Ana García",  detail: "Consulta de producto premium", time: "Hace 30 min", status: "pendiente"  },
    { id: "#002", client: "Carlos M.",   detail: "Pedido estándar × 2",          time: "Hace 3 hs",   status: "en proceso" },
    { id: "#003", client: "María L.",    detail: "Consulta express",             time: "Ayer",         status: "completado" },
    { id: "#004", client: "Pedro S.",    detail: "Pedido mayorista",             time: "Hace 2 días",  status: "completado" },
  ]

  const statusStyle: Record<string, string> = {
    pendiente:   "bg-amber-500/10 text-amber-400 border-amber-500/25",
    "en proceso":"bg-blue-500/10  text-blue-400  border-blue-500/25",
    completado:  "bg-green-500/10 text-green-400 border-green-500/25",
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <DemoBanner text={`Vista previa de ${sectionLabel}. Los ${reqLabel.toLowerCase()}s que tu bot registre aparecerán aquí en tiempo real.`} />
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">{sectionLabel}</h3>
            <p className="text-zinc-600 text-xs mt-0.5">4 {reqLabel.toLowerCase()}s · 1 pendiente</p>
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800/60">
          {orders.map((o, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <span className="text-zinc-600 text-xs font-mono flex-shrink-0">{o.id}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">{o.client}</p>
                <p className="text-zinc-500 text-xs truncate">{o.detail}</p>
              </div>
              <div className="text-right flex-shrink-0 space-y-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusStyle[o.status]}`}>{o.status}</span>
                <p className="text-zinc-700 text-[10px]">{o.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── PRODUCTS section ─────────────────────────────────────────────────────────
function ProductsSection({ session, sectionLabel }: { session: DemoSession; sectionLabel: string }) {
  const fc = session.feature_config || {}
  const catLabel = fc.catalog_label || sectionLabel
  const products = [
    { name: `${catLabel} Premium`, price: "$2.500", desc: "La opción más completa y exclusiva.", available: true },
    { name: `${catLabel} Estándar`, price: "$1.200", desc: "La alternativa más popular del mercado.", available: true },
    { name: `${catLabel} Básico`,   price: "$650",   desc: "Ideal para comenzar sin grandes inversiones.", available: true },
    { name: `${catLabel} Express`,  price: "$890",   desc: "Entrega o disponibilidad inmediata.",          available: false },
  ]
  return (
    <div className="flex-1 overflow-y-auto">
      <DemoBanner text={`Vista previa de ${sectionLabel}. Acá vas a poder cargar y gestionar todo tu catálogo. El bot lo usa para responder consultas y tomar pedidos.`} />
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">{catLabel}</h3>
            <p className="text-zinc-600 text-xs mt-0.5">4 ítems · 3 disponibles</p>
          </div>
          <span className="text-xs text-zinc-600 border border-zinc-700 rounded-lg px-3 py-1.5">+ Agregar</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {products.map((p, i) => (
            <div key={i} className={`bg-zinc-900 border rounded-xl p-4 space-y-2 ${p.available ? "border-zinc-800" : "border-zinc-800 opacity-50"}`}>
              <div className="flex items-start justify-between">
                <span className="text-white text-sm font-semibold">{p.name}</span>
                {!p.available && <span className="text-[10px] bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full">Agotado</span>}
              </div>
              <p className="text-zinc-500 text-xs">{p.desc}</p>
              <p className="text-[#CCFF00] font-bold text-base">{p.price}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── FORMS section ────────────────────────────────────────────────────────────
function FormsSection({ sectionLabel }: { sectionLabel: string }) {
  const forms = [
    { name: "Formulario de contacto", type: "link",           responses: 24, active: true  },
    { name: "Calificación de interés", type: "conversacional", responses: 11, active: true  },
    { name: "Encuesta post-visita",    type: "conversacional", responses: 7,  active: false },
  ]
  return (
    <div className="flex-1 overflow-y-auto">
      <DemoBanner text={`Vista previa de ${sectionLabel}. Podés crear formularios conversacionales (el bot los hace por chat) o de link (URL para compartir).`} />
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">{sectionLabel}</h3>
            <p className="text-zinc-600 text-xs mt-0.5">3 formularios · 42 respuestas totales</p>
          </div>
          <span className="text-xs text-zinc-600 border border-zinc-700 rounded-lg px-3 py-1.5">+ Crear</span>
        </div>
        <div className="space-y-3">
          {forms.map((form, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
                {form.type === "link" ? <Globe className="w-5 h-5 text-zinc-500" /> : <MessageSquare className="w-5 h-5 text-zinc-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold">{form.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-zinc-600 text-xs capitalize">{form.type}</span>
                  <span className="text-zinc-700">·</span>
                  <span className="text-zinc-600 text-xs">{form.responses} respuestas</span>
                </div>
              </div>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${form.active ? "bg-[#CCFF00]" : "bg-zinc-700"}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── PROMOTIONS section ───────────────────────────────────────────────────────
function PromotionsSection({ sectionLabel }: { sectionLabel: string }) {
  const campaigns = [
    { name: "Campaña de reactivación", sent: 45, opened: 18, status: "activa"     },
    { name: "Oferta especial clientes", sent: 30, opened: 22, status: "completada" },
    { name: "Promo fin de semana",      sent: 0,  opened: 0,  status: "borrador"   },
  ]
  const statusStyle: Record<string, string> = {
    activa:     "bg-green-500/10 text-green-400 border-green-500/25",
    completada: "bg-zinc-500/10  text-zinc-400  border-zinc-700",
    borrador:   "bg-amber-500/10 text-amber-400 border-amber-500/25",
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <DemoBanner text={`Vista previa de ${sectionLabel}. Desde acá podés enviar campañas masivas a tus contactos segmentados por tag o comportamiento.`} />
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">{sectionLabel}</h3>
            <p className="text-zinc-600 text-xs mt-0.5">3 campañas</p>
          </div>
          <span className="text-xs text-zinc-600 border border-zinc-700 rounded-lg px-3 py-1.5">+ Nueva</span>
        </div>
        <div className="space-y-3">
          {campaigns.map((c, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0 text-xl">📢</div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold">{c.name}</p>
                {c.sent > 0 && (
                  <p className="text-zinc-600 text-xs">{c.sent} enviados · {c.opened} abrieron</p>
                )}
              </div>
              <span className={`text-[10px] px-2.5 py-1 rounded-full border font-medium flex-shrink-0 ${statusStyle[c.status]}`}>{c.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Section router ───────────────────────────────────────────────────────────
function SectionContent({ section, session }: { section: SidebarItem; session: DemoSession }) {
  const fc = session.feature_config || {}
  const today = new Date()
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const dayAfter = new Date(today); dayAfter.setDate(today.getDate() + 2)
  const fmt = (d: Date) => d.toISOString().split("T")[0]

  const MOCK_CLIENTS = [
    { id: "c1", name: "María García", phone: "+54 9 11 1234-5678", email: "maria@gmail.com", instagram_username: "mariag_oficial", birthday: "1990-05-15", points: 120, total_purchases: 3, last_purchase_date: fmt(today), created_at: new Date(today.getTime() - 86400000 * 5).toISOString() },
    { id: "c2", name: "Juan López", phone: "+54 9 11 9876-5432", email: undefined, instagram_username: "juanl92", birthday: undefined, points: 45, total_purchases: 1, last_purchase_date: undefined, created_at: new Date(today.getTime() - 86400000 * 2).toISOString() },
    { id: "c3", name: "Carlos Ruiz", phone: "+54 9 11 5555-4444", email: "cruiz@empresa.com", instagram_username: undefined, birthday: "1985-11-30", points: 320, total_purchases: 8, last_purchase_date: fmt(new Date(today.getTime() - 86400000 * 2)), created_at: new Date(today.getTime() - 86400000 * 30).toISOString() },
    { id: "c4", name: "Ana Martínez", phone: "+54 9 11 3333-2222", email: "ana.m@gmail.com", instagram_username: "ana_martinez_ok", birthday: "1995-03-22", points: 85, total_purchases: 2, last_purchase_date: fmt(new Date(today.getTime() - 86400000 * 5)), created_at: new Date(today.getTime() - 86400000 * 10).toISOString() },
  ]

  const MOCK_RESERVATIONS = [
    { id: "r1", customer_name: "María García", customer_phone: "+54 9 11 1234-5678", reservation_date: fmt(today), reservation_time: "15:00", party_size: 2, status: "confirmed", table_number: "5", special_requests: "Mesa cerca de la ventana", tags: ["regular"], conversation: { platform: "whatsapp" } },
    { id: "r2", customer_name: "Juan López", customer_phone: "+54 9 11 9876-5432", reservation_date: fmt(tomorrow), reservation_time: "10:00", party_size: 1, status: "pending", table_number: undefined, special_requests: undefined, tags: [], conversation: { platform: "instagram" } },
    { id: "r3", customer_name: "Ana Martínez", customer_phone: "+54 9 11 3333-2222", reservation_date: fmt(dayAfter), reservation_time: "16:30", party_size: 4, status: "confirmed", table_number: "3", special_requests: "Celebración de cumpleaños", tags: ["vip"], conversation: { platform: "whatsapp" } },
    { id: "r4", customer_name: "Carlos Ruiz", customer_phone: "+54 9 11 5555-4444", reservation_date: fmt(dayAfter), reservation_time: "09:00", party_size: 2, status: "confirmed", table_number: "8", special_requests: undefined, tags: [], conversation: undefined },
  ]

  const MOCK_AUTOMATIONS = [
    { id: "a1", name: "Feliz Cumpleaños", trigger_type: "birthday" as const, trigger_config: {}, message_template: "¡Feliz cumpleaños {nombre}! Tenemos un regalo especial para vos.", bot_id: "demo-bot", is_active: true, created_at: new Date(today.getTime() - 86400000 * 10).toISOString(), bots: { id: "demo-bot", name: session.bot_name, platform: "whatsapp" } },
    { id: "a2", name: "Re-engagement de leads", trigger_type: "inactive_client" as const, trigger_config: { days: 7 }, message_template: "Hola {nombre}, hace tiempo que no hablamos. ¿Puedo ayudarte?", bot_id: "demo-bot", is_active: true, created_at: new Date(today.getTime() - 86400000 * 5).toISOString(), bots: { id: "demo-bot", name: session.bot_name, platform: "whatsapp" } },
    { id: "a3", name: "Campaña de promoción", trigger_type: "new_promotion" as const, trigger_config: {}, message_template: "¡{nombre}! Tenemos una oferta especial que no te podés perder.", bot_id: "demo-bot", is_active: false, created_at: new Date(today.getTime() - 86400000 * 2).toISOString(), bots: { id: "demo-bot", name: session.bot_name, platform: "whatsapp" } },
  ]

  const MOCK_BOTS = [
    { id: "demo-bot", name: session.bot_name, platform: "whatsapp" as const, personality_prompt: session.business_summary || "", features: session.features || [], allowed_tags: session.allowed_tags || [], automations: [], is_active: true, created_at: new Date().toISOString(), user_id: "demo-user" },
  ]

  switch (section.id) {
    case "dashboard":   return <DashboardSection session={session} />
    case "bots":        return (
      <div className="flex-1 overflow-y-auto bg-background p-4">
        <BotsManagement initialBots={MOCK_BOTS} userId="demo-user" demo={true} />
      </div>
    )
    case "automations": return (
      <div className="flex-1 overflow-y-auto bg-background p-4">
        <AutomationsManagement initialAutomations={MOCK_AUTOMATIONS} userId="demo-user" demo={true} />
      </div>
    )
    case "clients":     return (
      <div className="flex-1 overflow-y-auto bg-background p-4">
        <ClientsManagement
          initialClients={MOCK_CLIENTS}
          userId="demo-user"
          pagination={{ page: 1, limit: 10, totalItems: MOCK_CLIENTS.length, totalPages: 1, hasNextPage: false, hasPrevPage: false }}
          searchTerm=""
          demo={true}
        />
      </div>
    )
    case "reservations":return (
      <div className="flex-1 overflow-y-auto bg-background p-4">
        <ReservasClient
          reservations={MOCK_RESERVATIONS}
          pagination={{ page: 1, limit: 10, totalItems: MOCK_RESERVATIONS.length, totalPages: 1 }}
          demo={true}
        />
      </div>
    )
    case "orders":      return <OrdersSection session={session} sectionLabel={section.label} />
    case "products":    return <ProductsSection session={session} sectionLabel={section.label} />
    case "forms":       return <FormsSection sectionLabel={section.label} />
    case "promotions":  return <PromotionsSection sectionLabel={section.label} />
    default: return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <p className="text-white font-semibold">{section.label}</p>
          <p className="text-zinc-500 text-sm">Disponible en tu cuenta completa.</p>
          <Link href="/demo" className="inline-flex items-center gap-1.5 bg-[#CCFF00] text-black text-sm font-bold px-4 py-2 rounded-xl hover:bg-[#b8e600] transition-colors">
            Activar cuenta <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    )
  }
}

// ─── Sidebar component ────────────────────────────────────────────────────────
interface DemoSidebarProps {
  session: DemoSession; visibleSections: SidebarItem[]
  activeSection: string; onSelectSection: (id: string) => void
  onProbar: () => void
}
function DemoSidebar({ session, visibleSections, activeSection, onSelectSection, onProbar }: DemoSidebarProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-zinc-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#CCFF00] flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-black" />
          </div>
          <div className="min-w-0">
            <div className="text-white text-xs font-bold tracking-wider uppercase">UCOBOT</div>
            <div className="text-zinc-500 text-[10px] truncate">{session.business_name}</div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3.5 border-b border-zinc-900">
        <div className="text-zinc-600 text-[10px] uppercase tracking-wider mb-1.5">Asistente configurado</div>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-white text-sm font-semibold truncate">{session.bot_name}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#CCFF00] animate-pulse" />
              <span className="text-zinc-500 text-xs">En línea</span>
            </div>
          </div>
          <button
            onClick={onProbar}
            className="flex-shrink-0 bg-[#CCFF00] text-black text-[10px] font-bold px-2.5 py-1 rounded-lg hover:bg-[#b8e600] transition-colors flex items-center gap-1"
          >
            <Bot className="w-3 h-3" />
            PROBAR
          </button>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        <div className="space-y-0.5">
          {visibleSections.filter((s) => FIXED_SECTION_IDS.has(s.id)).map((section) => {
            const IconComponent = SIDEBAR_ICONS[section.icon] || MessageSquare
            const isActive = activeSection === section.id
            return (
              <button key={section.id} onClick={() => onSelectSection(section.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left ${
                  isActive ? "bg-[#CCFF00] text-black font-semibold" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                }`}>
                <IconComponent className="w-4 h-4 flex-shrink-0" />
                {section.label}
              </button>
            )
          })}
        </div>

        {visibleSections.some((s) => !FIXED_SECTION_IDS.has(s.id)) && (
          <>
            <div className="mx-3 my-3 border-t border-zinc-800" />
            <p className="text-zinc-700 text-[10px] uppercase tracking-wider px-3 mb-1.5">Tu negocio</p>
            <div className="space-y-0.5">
              {visibleSections.filter((s) => !FIXED_SECTION_IDS.has(s.id)).map((section) => {
                const IconComponent = SIDEBAR_ICONS[section.icon] || MessageSquare
                const isActive = activeSection === section.id
                return (
                  <button key={section.id} onClick={() => onSelectSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left ${
                      isActive ? "bg-[#CCFF00] text-black font-semibold" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                    }`}>
                    <IconComponent className="w-4 h-4 flex-shrink-0" />
                    {section.label}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-zinc-900">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2.5">
          <div>
            <p className="text-white text-xs font-semibold">¿Te convenció la demo?</p>
            <p className="text-zinc-600 text-[10px] mt-0.5">Tu configuración queda guardada.</p>
          </div>
          <Link href="/demo"
            className="flex items-center justify-center gap-1.5 bg-[#CCFF00] text-black text-xs font-bold px-3 py-2 rounded-lg hover:bg-[#b8e600] transition-colors w-full">
            Activar mi cuenta <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── MENSAJES section (hardcoded inbox) ──────────────────────────────────────
type ConvMsg = { from: "bot" | "client"; text: string }
interface DemoConversation {
  id: string; name: string; platform: "whatsapp" | "instagram"
  lastMsg: string; time: string; unread: number; messages: ConvMsg[]
}

function MensajesDemoSection({ session }: { session: DemoSession }) {
  const fc = session.feature_config || {}
  const appLabel = (fc.appointments_label || "cita").toLowerCase()
  const reqLabel = (fc.requests_label || "pedido").toLowerCase()

  const conversations: DemoConversation[] = [
    {
      id: "maria", name: "María García", platform: "whatsapp",
      lastMsg: "Perfecto! Entonces nos vemos el martes.", time: "Hace 10 min", unread: 0,
      messages: [
        { from: "client", text: `Hola! Quería consultar por los precios` },
        { from: "bot", text: `¡Hola María! Con gusto te ayudo. ¿Qué servicio te interesa?` },
        { from: "client", text: `El servicio premium, ¿cuánto sale?` },
        { from: "bot", text: `El servicio premium tiene un valor de $2.500. Incluye atención personalizada, seguimiento y garantía. ¿Te gustaría agendar una ${appLabel}?` },
        { from: "client", text: `Sí, me interesa. ¿Tienen disponibilidad el martes?` },
        { from: "bot", text: `¡Perfecto! Tenemos disponibilidad el martes a las 15:00 y 17:00. ¿Cuál te viene mejor?` },
        { from: "client", text: `Las 15:00 me viene bien.` },
        { from: "bot", text: `Tu ${appLabel} quedó confirmada para el martes a las 15:00. Te enviaré un recordatorio el día antes. ¿Necesitás algo más?` },
        { from: "client", text: `Perfecto! Entonces nos vemos el martes.` },
      ],
    },
    {
      id: "juan", name: "Juan López", platform: "instagram",
      lastMsg: "Están abiertos mañana?", time: "Hace 2 hs", unread: 1,
      messages: [
        { from: "client", text: `Están abiertos mañana?` },
        { from: "bot", text: `¡Hola Juan! Sí, mañana estamos abiertos de 9:00 a 18:00. ¿En qué te podemos ayudar?` },
        { from: "client", text: `Están abiertos mañana?` },
      ],
    },
    {
      id: "carlos", name: "Carlos Ruiz", platform: "whatsapp",
      lastMsg: "Quiero más info del servicio premium", time: "Ayer", unread: 0,
      messages: [
        { from: "client", text: `Quiero más info del servicio premium` },
        { from: "bot", text: `¡Claro, Carlos! El servicio premium incluye atención personalizada y seguimiento post-servicio. Precio: $2.500. ¿Querés que te contacte un asesor?` },
        { from: "client", text: `Tienen plan de cuotas?` },
        { from: "bot", text: `Sí, manejamos 3 y 6 cuotas sin interés. ¿Te interesa que un asesor te contacte para más detalles?` },
      ],
    },
    {
      id: "ana", name: "Ana Martínez", platform: "whatsapp",
      lastMsg: "Gracias! Me registré", time: "Hace 3 días", unread: 0,
      messages: [
        { from: "client", text: `Hola! Me gustaría registrarme como cliente` },
        { from: "bot", text: `¡Bienvenida! Para registrarte necesito tu nombre completo y teléfono de contacto.` },
        { from: "client", text: `Ana Martínez, +54 9 11 3333-2222` },
        { from: "bot", text: `¡Listo Ana! Ya quedaste registrada como cliente. Vas a recibir novedades y promociones exclusivas. ¿Puedo ayudarte con algo más?` },
        { from: "client", text: `Gracias! Me registré` },
      ],
    },
  ]

  const [selectedId, setSelectedId] = useState(conversations[0].id)
  const selected = conversations.find((c) => c.id === selectedId) ?? conversations[0]
  const msgEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [selectedId])

  const platformIcon = (p: string) => p === "instagram" ? "📸" : "💬"

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left — conversation list */}
      <div className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-background">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Mensajes</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{conversations.length} conversaciones</p>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedId(conv.id)}
              className={`w-full px-4 py-3.5 flex items-start gap-3 text-left transition-colors ${
                selectedId === conv.id ? "bg-accent" : "hover:bg-muted/50"
              }`}
            >
              <div className="relative flex-shrink-0">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-foreground">
                  {conv.name.charAt(0)}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 text-[10px] leading-none">{platformIcon(conv.platform)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium text-foreground truncate">{conv.name}</span>
                  {conv.unread > 0 && (
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[#CCFF00] text-black text-[9px] font-black flex items-center justify-center">{conv.unread}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMsg}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{conv.time}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right — conversation messages */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-foreground flex-shrink-0">
            {selected.name.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{selected.name}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{platformIcon(selected.platform)} {selected.platform}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <DemoBanner text="Vista previa del inbox. En tu cuenta real verás las conversaciones reales de tus clientes en tiempo real." />
          {selected.messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.from === "client" ? "justify-end" : "justify-start"} gap-2`}>
              {msg.from === "bot" && (
                <div className="w-6 h-6 rounded-full bg-[#CCFF00] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-black" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.from === "client"
                  ? "bg-[#CCFF00] text-black rounded-br-sm font-medium"
                  : "bg-card text-card-foreground border border-border rounded-bl-sm"
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={msgEndRef} />
        </div>

        {/* Locked input */}
        <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-border bg-background">
          <div className="bg-muted border border-border rounded-2xl flex items-center gap-2 px-4 py-3 opacity-60 cursor-not-allowed">
            <span className="flex-1 text-sm text-muted-foreground">Respondé directamente desde WhatsApp o Instagram...</span>
            <Send className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-center text-muted-foreground/50 text-[10px] mt-2 uppercase tracking-wider">
            ACTIVÁ TU CUENTA PARA RESPONDER MENSAJES REALES
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Bot demo chat overlay (autónomo) ────────────────────────────────────────
function BotDemoChat({ session, sessionId, onClose }: { session: DemoSession; sessionId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [registeredClientName, setRegisteredClientName] = useState<string | null>(null)
  const [currentLeadTag, setCurrentLeadTag] = useState<string | null>(null)
  const [messageEvents, setMessageEvents] = useState<Record<string, ChatEvent[]>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const featureChips = getFeatureChips(session)

  useEffect(() => {
    fetch(`/api/demo/chat?sessionId=${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages?.length) { setMessages(data.messages); setShowChat(true) }
      })
  }, [sessionId])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, messageEvents])

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return
    const msgId = Date.now().toString()
    setMessages((prev) => [...prev, { id: msgId, sender_type: "client", content: text.trim(), created_at: new Date().toISOString() }])
    setInput(""); setIsLoading(true); setShowChat(true)
    if (inputRef.current) inputRef.current.style.height = "auto"
    try {
      const res = await fetch("/api/demo/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        const botMsgId = (Date.now() + 1).toString()
        setMessages((prev) => [...prev, { id: botMsgId, sender_type: "bot", content: data.response, created_at: new Date().toISOString() }])
        const evts: ChatEvent[] = []
        const meta = data.metadata || {}
        if (meta.clientName && !registeredClientName) { setRegisteredClientName(meta.clientName); evts.push({ type: "client_registered", name: meta.clientName }) }
        if (meta.leadTag && meta.leadTag !== currentLeadTag) { setCurrentLeadTag(meta.leadTag); evts.push({ type: "lead_tagged", tag: meta.leadTag }) }
        if (meta.needsHandover) evts.push({ type: "lead_tagged", tag: "🔔 Derivado a asesor" })
        if (evts.length > 0) setMessageEvents((prev) => ({ ...prev, [botMsgId]: evts }))
      }
    } finally { setIsLoading(false); inputRef.current?.focus() }
  }

  return (
    <div className="flex flex-col h-full bg-[#0C0C12]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#CCFF00] flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-black" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold">{session.bot_name}</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#CCFF00] animate-pulse" />
              <span className="text-zinc-500 text-xs">En línea</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentLeadTag && (
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getTagColor(currentLeadTag).bg} ${getTagColor(currentLeadTag).text} ${getTagColor(currentLeadTag).border}`}>
              <Tag className="w-3 h-3" />{currentLeadTag}
            </div>
          )}
          <button onClick={() => { setMessages([]); setMessageEvents({}); setShowChat(false); setInput(""); setRegisteredClientName(null); setCurrentLeadTag(null) }}
            className="text-xs text-zinc-500 border border-zinc-700 rounded-lg px-2.5 py-1.5 hover:border-zinc-500 transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages / welcome */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!showChat ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
            <div className="w-full max-w-lg space-y-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#CCFF00] flex items-center justify-center mx-auto">
                <Bot className="w-8 h-8 text-black" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-white text-xl font-bold">{session.bot_name}</h2>
                <p className="text-zinc-400 text-sm">{session.business_name}</p>
              </div>
              {featureChips.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  {featureChips.map((chip, i) => (
                    <button key={i} onClick={() => sendMessage(chip.message)}
                      className="bg-zinc-900 hover:bg-[#CCFF00] border border-zinc-700 hover:border-[#CCFF00] text-zinc-300 hover:text-black text-sm font-medium px-4 py-2 rounded-full transition-all">
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}
              {session.suggested_questions?.slice(0, 4).map((q, i) => (
                <button key={i} onClick={() => sendMessage(q.title)}
                  className="w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3 text-left text-white text-sm font-medium transition-all">
                  {q.title}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="max-w-lg mx-auto space-y-1">
              {messages.map((msg, i) => (
                <div key={msg.id}>
                  <div className={`flex gap-3 ${msg.sender_type === "client" ? "justify-end" : "justify-start"} ${i > 0 ? "mt-3" : ""}`}>
                    {msg.sender_type === "bot" && (
                      <div className="w-7 h-7 rounded-lg bg-[#CCFF00] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="w-4 h-4 text-black" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.sender_type === "client" ? "bg-[#CCFF00] text-black rounded-br-sm font-medium" : "bg-zinc-900 text-white rounded-bl-sm border border-zinc-800"
                    }`}>
                      {msg.content.replace(/\[HANDOVER\]/g, "").trim()}
                    </div>
                  </div>
                  <AnimatePresence>
                    {messageEvents[msg.id]?.map((evt, ei) => (
                      <div key={ei}>
                        {evt.type === "client_registered" && evt.name && <ClientRegisteredCard name={evt.name} />}
                        {evt.type === "lead_tagged" && evt.tag && (
                          evt.tag.includes("Derivado") ? <HandoverNotice /> : <LeadTagBadge tag={evt.tag} />
                        )}
                      </div>
                    ))}
                  </AnimatePresence>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 justify-start mt-3">
                  <div className="w-7 h-7 rounded-lg bg-[#CCFF00] flex items-center justify-center flex-shrink-0 mt-0.5"><Bot className="w-4 h-4 text-black" /></div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1.5 items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl flex items-end gap-2 px-4 py-3 focus-within:border-zinc-600 transition-colors">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
            placeholder="Escribí tu mensaje... (Enter para enviar)"
            rows={1} className="flex-1 bg-transparent text-white text-sm placeholder:text-zinc-600 resize-none focus:outline-none max-h-32 leading-relaxed"
            onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 128) + "px" }} />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading}
            className="text-zinc-600 hover:text-[#CCFF00] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0 mb-0.5">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Feature-based chat chips ─────────────────────────────────────────────────
function getFeatureChips(session: DemoSession): { label: string; message: string }[] {
  const chips: { label: string; message: string }[] = []
  const f = session.features || []
  const fc = session.feature_config || {}
  const appLabel = (fc.appointments_label || "cita").toLowerCase()
  const reqLabel = (fc.requests_label || "pedido").toLowerCase()

  if (f.includes("manage_appointments"))
    chips.push({ label: `📅 Quiero agendar una ${appLabel}`, message: `Quiero agendar una ${appLabel}` })
  if (f.includes("take_orders"))
    chips.push({ label: `🛒 Quiero hacer un ${reqLabel}`, message: `Quiero hacer un ${reqLabel}` })
  if (f.includes("lead_qualification"))
    chips.push({ label: "💬 Consultar opciones y precios", message: "Me gustaría saber las opciones disponibles y los precios" })
  if (f.includes("register_clients"))
    chips.push({ label: "👋 Registrar mis datos", message: "Me gustaría registrarme como cliente" })
  if (f.includes("loyalty_points"))
    chips.push({ label: "⭐ Ver mis puntos", message: "Quiero saber cuántos puntos tengo" })

  return chips
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DemoChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { theme, setTheme } = useTheme()
  const [session, setSession] = useState<DemoSession | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSession, setIsLoadingSession] = useState(true)
  const [showChat, setShowChat] = useState(false)
  const [registeredClientName, setRegisteredClientName] = useState<string | null>(null)
  const [currentLeadTag, setCurrentLeadTag] = useState<string | null>(null)
  const [messageEvents, setMessageEvents] = useState<Record<string, ChatEvent[]>>({})
  const [activeSection, setActiveSection] = useState("chat")
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { loadSession() }, [sessionId])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, messageEvents])

  const loadSession = async () => {
    try {
      const res = await fetch(`/api/demo/chat?sessionId=${sessionId}`)
      const data = await res.json()
      if (res.ok) {
        setSession(data.session)
        setMessages(data.messages)
        if (data.messages.length > 0) setShowChat(true)
      }
    } finally {
      setIsLoadingSession(false)
    }
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return
    const msgId = Date.now().toString()
    setMessages((prev) => [...prev, { id: msgId, sender_type: "client", content: text.trim(), created_at: new Date().toISOString() }])
    setInput("")
    setIsLoading(true)
    setShowChat(true)
    if (inputRef.current) inputRef.current.style.height = "auto"

    try {
      const res = await fetch("/api/demo/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        const botMsgId = (Date.now() + 1).toString()
        setMessages((prev) => [...prev, { id: botMsgId, sender_type: "bot", content: data.response, created_at: new Date().toISOString() }])
        const eventsForMsg: ChatEvent[] = []
        const meta = data.metadata || {}
        if (meta.clientName && !registeredClientName) {
          setRegisteredClientName(meta.clientName)
          eventsForMsg.push({ type: "client_registered", name: meta.clientName })
        }
        if (meta.leadTag && meta.leadTag !== currentLeadTag) {
          setCurrentLeadTag(meta.leadTag)
          eventsForMsg.push({ type: "lead_tagged", tag: meta.leadTag })
        }
        if (meta.needsHandover) eventsForMsg.push({ type: "lead_tagged", tag: "🔔 Derivado a asesor" })
        if (eventsForMsg.length > 0) setMessageEvents((prev) => ({ ...prev, [botMsgId]: eventsForMsg }))
      }
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  const handleNewChat = () => {
    setMessages([]); setMessageEvents({}); setShowChat(false)
    setInput(""); setRegisteredClientName(null); setCurrentLeadTag(null)
  }

  if (isLoadingSession) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#CCFF00] flex items-center justify-center mx-auto">
            <Bot className="w-8 h-8 text-black" />
          </div>
          <Loader2 className="w-5 h-5 text-[#CCFF00] animate-spin mx-auto" />
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-white">Sesión no encontrada</p>
          <Link href="/demo" className="text-[#CCFF00] text-sm hover:underline">Crear un nuevo bot →</Link>
        </div>
      </div>
    )
  }

  const aiSections = (session.sidebar_config || []).filter((s) => s.visible && !FIXED_SECTION_IDS.has(s.id))
  const visibleSections: SidebarItem[] = [...FIXED_SECTIONS, ...aiSections]
  const activeSectionData = visibleSections.find((s) => s.id === activeSection) ?? visibleSections[0]
  const featureChips = getFeatureChips(session)

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Desktop sidebar — always dark */}
      <div className="hidden md:flex w-56 flex-shrink-0 bg-[#0C0C12] border-r border-zinc-900 flex-col">
        <DemoSidebar session={session} visibleSections={visibleSections}
          activeSection={activeSection} onSelectSection={(id) => setActiveSection(id)} />
      </div>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileSidebarOpen(false)} className="fixed inset-0 bg-black/70 z-40 md:hidden" />
            <motion.div initial={{ x: -224 }} animate={{ x: 0 }} exit={{ x: -224 }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              className="fixed left-0 top-0 bottom-0 w-56 bg-[#0C0C12] border-r border-zinc-800 z-50 md:hidden">
              <button onClick={() => setMobileSidebarOpen(false)}
                className="absolute top-3 right-3 text-zinc-500 hover:text-white p-1 transition-colors">
                <X className="w-4 h-4" />
              </button>
              <DemoSidebar session={session} visibleSections={visibleSections}
                activeSection={activeSection} onSelectSection={(id) => { setActiveSection(id); setMobileSidebarOpen(false) }} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main — theme-aware */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-background">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0 bg-background">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden text-muted-foreground hover:text-foreground transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-foreground text-sm font-semibold">{activeSectionData?.label || "Chat"}</span>
          </div>
          <div className="flex items-center gap-2">
            <AnimatePresence>
              {currentLeadTag && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                  className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getTagColor(currentLeadTag).bg} ${getTagColor(currentLeadTag).text} ${getTagColor(currentLeadTag).border}`}>
                  <Tag className="w-3 h-3" />
                  {currentLeadTag}
                </motion.div>
              )}
            </AnimatePresence>
            {activeSection === "chat" && (
              <button onClick={handleNewChat}
                className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:border-muted-foreground transition-colors">
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">NUEVO CHAT</span>
              </button>
            )}
            {/* Theme toggle */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
              title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Section content */}
        {activeSection !== "chat" ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            <SectionContent section={activeSectionData} session={session} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {!showChat ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
                <div className="w-full max-w-2xl space-y-7 text-center">
                  <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className="w-20 h-20 rounded-3xl bg-[#CCFF00] flex items-center justify-center mx-auto">
                    <Bot className="w-10 h-10 text-black" />
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-2">
                    <h1 className="text-foreground text-3xl font-bold">
                      {getGreeting()}, <span className="font-black">{session.contact_name.split(" ")[0]}</span>
                    </h1>
                    <p className="text-muted-foreground text-base">
                      ¿En qué puedo ayudarte con <span className="text-foreground font-medium">{session.business_name}</span>?
                    </p>
                  </motion.div>

                  {/* Feature chips — lo que el bot puede hacer */}
                  {featureChips.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                      className="flex flex-wrap justify-center gap-2">
                      {featureChips.map((chip, i) => (
                        <motion.button key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.18 + i * 0.05 }}
                          onClick={() => sendMessage(chip.message)}
                          className="bg-muted hover:bg-[#CCFF00] border border-border hover:border-[#CCFF00] text-muted-foreground hover:text-black text-sm font-medium px-4 py-2 rounded-full transition-all">
                          {chip.label}
                        </motion.button>
                      ))}
                    </motion.div>
                  )}

                  {/* AI suggested questions */}
                  {session.suggested_questions?.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl mx-auto">
                      {session.suggested_questions.slice(0, 6).map((q, i) => (
                        <motion.button key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.25 + i * 0.05 }}
                          onClick={() => sendMessage(q.title)}
                          className="bg-muted hover:bg-accent border border-border hover:border-muted-foreground rounded-xl p-4 text-left transition-all group">
                          <div className="text-foreground text-sm font-medium group-hover:text-[#CCFF00] transition-colors">{q.title}</div>
                          <div className="text-muted-foreground text-xs mt-1 leading-relaxed">{q.description}</div>
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="max-w-2xl mx-auto space-y-1">
                  {messages.map((msg, i) => (
                    <div key={msg.id}>
                      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                        className={`flex gap-3 ${msg.sender_type === "client" ? "justify-end" : "justify-start"} ${i > 0 ? "mt-3" : ""}`}>
                        {msg.sender_type === "bot" && (
                          <div className="w-7 h-7 rounded-lg bg-[#CCFF00] flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Bot className="w-4 h-4 text-black" />
                          </div>
                        )}
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          msg.sender_type === "client"
                            ? "bg-[#CCFF00] text-black rounded-br-sm font-medium"
                            : "bg-card text-card-foreground rounded-bl-sm border border-border"
                        }`}>
                          {msg.content.replace(/\[HANDOVER\]/g, "").trim()}
                        </div>
                      </motion.div>

                      <AnimatePresence>
                        {messageEvents[msg.id]?.map((evt, ei) => (
                          <div key={ei}>
                            {evt.type === "client_registered" && evt.name && <ClientRegisteredCard name={evt.name} />}
                            {evt.type === "lead_tagged" && evt.tag && (
                              evt.tag.includes("Derivado") ? <HandoverNotice /> : <LeadTagBadge tag={evt.tag} />
                            )}
                          </div>
                        ))}
                      </AnimatePresence>
                    </div>
                  ))}

                  {isLoading && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 justify-start mt-3">
                      <div className="w-7 h-7 rounded-lg bg-[#CCFF00] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="w-4 h-4 text-black" />
                      </div>
                      <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3">
                        <div className="flex gap-1.5 items-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                        </div>
                      </div>
                    </motion.div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>
            )}

            {/* Input */}
            <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-border bg-background">
              <div className="max-w-2xl mx-auto">
                <div className="bg-muted border border-border rounded-2xl flex items-end gap-2 px-4 py-3 focus-within:border-muted-foreground transition-colors">
                  <button className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mb-0.5">
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown} placeholder="Escribí tu mensaje... (Enter para enviar)"
                    rows={1} className="flex-1 bg-transparent text-foreground text-sm placeholder:text-muted-foreground resize-none focus:outline-none max-h-32 leading-relaxed"
                    onInput={(e) => {
                      const t = e.target as HTMLTextAreaElement
                      t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 128) + "px"
                    }} />
                  <button onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading}
                    className="text-muted-foreground hover:text-[#CCFF00] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0 mb-0.5">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-center text-muted-foreground/50 text-[10px] mt-2 uppercase tracking-wider">
                  UCOBOT PUEDE COMETER ERRORES · VERIFICÁ INFORMACIÓN IMPORTANTE
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
