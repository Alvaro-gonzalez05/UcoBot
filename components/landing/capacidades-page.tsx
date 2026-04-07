"use client"

import { useRef, useEffect, useState } from "react"
import Link from "next/link"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"

gsap.registerPlugin(ScrollTrigger)

// ─── Animated Counter ────────────────────────────────────────────────────────
function AnimatedCounter({ to, prefix = "", suffix = "" }: { to: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const obj = { val: 0 }
    const trig = ScrollTrigger.create({
      trigger: el,
      start: "top 90%",
      once: true,
      onEnter: () =>
        gsap.to(obj, {
          val: to,
          duration: 2.4,
          ease: "power2.out",
          onUpdate: () => {
            el.textContent = prefix + Math.round(obj.val).toLocaleString("es-AR") + suffix
          },
        }),
    })
    return () => trig.kill()
  }, [to, prefix, suffix])
  return <span ref={ref}>{prefix}0{suffix}</span>
}

// ─── Laptop Device Frame ─────────────────────────────────────────────────────
const LAPTOP_W = 560
const LAPTOP_H = 350
const IFRAME_RENDER_W = 1200

function LaptopFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: LAPTOP_W + 28 }}>
      <div style={{
        background: "linear-gradient(145deg, #1d1d32, #131321)",
        borderRadius: "20px 20px 0 0",
        padding: "14px 14px 0",
        boxShadow: "0 0 0 1.5px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}>
        {/* Camera dot */}
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#252542", margin: "0 auto 10px", boxShadow: "0 0 0 1px rgba(255,255,255,0.07)" }} />
        {/* Screen */}
        <div style={{ width: LAPTOP_W, height: LAPTOP_H, borderRadius: "8px 8px 0 0", overflow: "hidden", background: "#07070f" }}>
          {children}
        </div>
      </div>
      {/* Base */}
      <div style={{
        background: "linear-gradient(180deg, #242440, #191929)",
        height: 22, borderRadius: "0 0 14px 14px", position: "relative",
        boxShadow: "0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)",
      }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 100, height: 5, background: "#0d0d1c", borderRadius: "0 0 8px 8px" }} />
      </div>
    </div>
  )
}

// ─── Phone Device Frame ──────────────────────────────────────────────────────
const PHONE_W = 240
const PHONE_H = 470

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "linear-gradient(145deg, #1d1d32, #131321)",
      borderRadius: 48, padding: "18px 12px 14px",
      display: "flex", flexDirection: "column", alignItems: "center",
      boxShadow: "0 0 0 1.5px rgba(255,255,255,0.1), 0 0 0 4px rgba(255,255,255,0.03), 0 40px 100px rgba(0,0,0,0.6)",
    }}>
      {/* Dynamic island */}
      <div style={{ width: 92, height: 26, background: "#08080f", borderRadius: 14, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1c1c2e", border: "1px solid rgba(255,255,255,0.1)" }} />
        <div style={{ width: 26, height: 8, borderRadius: 4, background: "#1c1c2e" }} />
      </div>
      {/* Screen */}
      <div style={{ width: PHONE_W, height: PHONE_H, borderRadius: 30, overflow: "hidden", background: "#0a0a14" }}>
        {children}
      </div>
      <div style={{ width: 80, height: 4, background: "rgba(255,255,255,0.18)", borderRadius: 2, marginTop: 12 }} />
    </div>
  )
}

// ─── Iframe inside Laptop ────────────────────────────────────────────────────
function LaptopScreen({ src }: { src: string }) {
  const scale = LAPTOP_W / IFRAME_RENDER_W       // 0.4667
  const renderH = Math.ceil(LAPTOP_H / scale)    // ~750
  return (
    <div style={{ width: LAPTOP_W, height: LAPTOP_H, overflow: "hidden" }}>
      <iframe src={src} loading="lazy" title="preview"
        style={{ width: IFRAME_RENDER_W, height: renderH, border: "none", transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none", display: "block" }}
      />
    </div>
  )
}

// ─── Iframe inside Phone ─────────────────────────────────────────────────────
function PhoneScreen({ src }: { src: string }) {
  const renderW = 390
  const scale = PHONE_W / renderW               // ~0.615
  const renderH = Math.ceil(PHONE_H / scale)   // ~764
  return (
    <div style={{ width: PHONE_W, height: PHONE_H, overflow: "hidden" }}>
      <iframe src={src} loading="lazy" title="preview"
        style={{ width: renderW, height: renderH, border: "none", transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none", display: "block" }}
      />
    </div>
  )
}

// ─── CSS Mini Mockup: Chat ───────────────────────────────────────────────────
function ChatScreen() {
  const msgs = [
    { from: "bot" as const, text: "¡Hola! Soy UCO Bot. ¿En qué puedo ayudarte?", dark: false },
    { from: "user" as const, text: "Quiero reservar para mañana a las 20:00", dark: false },
    { from: "bot" as const, text: "¿Para cuántas personas y a qué nombre?", dark: false },
    { from: "user" as const, text: "4 personas, nombre García", dark: false },
    { from: "bot" as const, text: "✅ ¡Reserva confirmada! Te enviamos los detalles.", dark: true },
  ]
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#F0F0EA", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#1C1C28", padding: "11px 13px", display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#D1F366", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#1C1C28" }}>smart_toy</span>
        </div>
        <div>
          <div style={{ color: "white", fontWeight: 700, fontSize: 9.5 }}>UCO Bot · WhatsApp</div>
          <div style={{ color: "#D1F366", fontSize: 7.5 }}>● Online ahora</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>more_vert</span>
        </div>
      </div>
      {/* Messages */}
      <div style={{ flex: 1, padding: "10px 9px", display: "flex", flexDirection: "column", gap: 7, overflow: "hidden" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              background: m.from === "user" ? "#D1F366" : m.dark ? "#1C1C28" : "white",
              color: m.from === "user" ? "#1C1C28" : m.dark ? "#D1F366" : "#1C1C28",
              borderRadius: m.from === "user" ? "13px 3px 13px 13px" : "3px 13px 13px 13px",
              padding: "6px 9px", maxWidth: "76%", fontSize: 8.5, fontWeight: 500,
              boxShadow: m.from !== "user" ? "0 1px 3px rgba(0,0,0,0.07)" : "none",
            }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      {/* Input */}
      <div style={{ padding: "6px 8px", background: "white", borderTop: "1px solid #eee", display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{ flex: 1, background: "#F5F5F7", borderRadius: 18, padding: "5px 9px", color: "#8A8A99", fontSize: 7.5 }}>Escribí tu mensaje...</div>
        <div style={{ width: 24, height: 24, background: "#D1F366", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#1C1C28" }}>send</span>
        </div>
      </div>
    </div>
  )
}

// ─── CSS Mini Mockup: Automations ────────────────────────────────────────────
function AutomationsScreen() {
  const flows = [
    { name: "Bienvenida a nuevos contactos", trigger: "Nuevo suscriptor", active: true, count: "1.2K" },
    { name: "Recordatorio de reserva", trigger: "24h antes de cita", active: true, count: "432" },
    { name: "Carrito abandonado", trigger: "Sin compra +2h", active: false, count: "89" },
    { name: "Campaña fin de mes", trigger: "Día 28 del mes", active: true, count: "2.8K" },
    { name: "Feedback post-venta", trigger: "1h después de compra", active: true, count: "310" },
  ]
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#F5F5F7", fontFamily: "Inter, sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: 60, background: "#1C1C28", padding: "9px 5px", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
        <div style={{ background: "#D1F366", borderRadius: 5, padding: "4px 2px", textAlign: "center", fontWeight: 800, fontSize: 6.5, color: "#1C1C28", marginBottom: 7 }}>UCO</div>
        {["dashboard", "account_tree", "chat_bubble", "group", "sell", "settings"].map((icon, i) => (
          <div key={i} style={{ padding: "4px 2px", borderRadius: 5, background: i === 1 ? "rgba(209,243,102,0.2)" : "transparent", display: "flex", justifyContent: "center" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12, color: i === 1 ? "#D1F366" : "rgba(255,255,255,0.28)" }}>{icon}</span>
          </div>
        ))}
      </div>
      {/* Content */}
      <div style={{ flex: 1, padding: "9px 8px", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
          <div style={{ fontWeight: 700, fontSize: 9.5, color: "#1C1C28" }}>Automatizaciones</div>
          <div style={{ background: "#D1F366", borderRadius: 5, padding: "2px 6px", fontWeight: 700, fontSize: 6.5, color: "#1C1C28" }}>+ Nueva</div>
        </div>
        {flows.map((f) => (
          <div key={f.name} style={{ background: "white", borderRadius: 6, padding: "6px 7px", border: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: f.active ? "rgba(209,243,102,0.15)" : "rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 10, color: f.active ? "#D1F366" : "#ccc" }}>account_tree</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: "#1C1C28", fontSize: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
              <div style={{ color: "#8A8A99", fontSize: 7 }}>{f.trigger}</div>
            </div>
            <span style={{ color: "#8A8A99", fontSize: 7.5, marginRight: 3, flexShrink: 0 }}>{f.count}</span>
            <div style={{ width: 24, height: 12, borderRadius: 6, background: f.active ? "#D1F366" : "#E0E0E0", position: "relative", flexShrink: 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "white", position: "absolute", top: 2, left: f.active ? 14 : 2, boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── CSS Mini Mockup: Bots Management ──────────────────────────────────────
function BotsScreen() {
  const bots = [
    { name: "Bot Ventas WA", platform: "WhatsApp", icon: "forum", active: true, color: "#25D366", msgs: "1.4K" },
    { name: "Bot Reservas", platform: "WhatsApp", icon: "forum", active: true, color: "#25D366", msgs: "892" },
    { name: "Bot Instagram", platform: "Instagram", icon: "photo_camera", active: true, color: "#E1306C", msgs: "643" },
    { name: "Bot Email CRM", platform: "Email", icon: "mail", active: false, color: "#818CF8", msgs: "210" },
  ]
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#F5F5F7", fontFamily: "Inter, sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: 58, background: "#1C1C28", padding: "9px 4px", display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
        <div style={{ background: "#D1F366", borderRadius: 6, padding: "4px", textAlign: "center", fontWeight: 800, fontSize: 6, color: "#1C1C28", marginBottom: 9 }}>UCO</div>
        {["dashboard", "smart_toy", "account_tree", "group", "sell", "settings"].map((icon, i) => (
          <div key={i} style={{ padding: "5px 3px", borderRadius: 6, background: i === 1 ? "rgba(209,243,102,0.18)" : "transparent", display: "flex", justifyContent: "center" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: i === 1 ? "#D1F366" : "rgba(255,255,255,0.28)" }}>{icon}</span>
          </div>
        ))}
      </div>
      {/* Content */}
      <div style={{ flex: 1, padding: "10px 9px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 10, color: "#1C1C28" }}>Mis Chatbots</div>
            <div style={{ fontSize: 7, color: "#8A8A99" }}>{bots.filter(b => b.active).length} activos · {bots.length} total</div>
          </div>
          <div style={{ background: "#D1F366", borderRadius: 6, padding: "3px 7px", fontWeight: 700, fontSize: 7, color: "#1C1C28", display: "flex", alignItems: "center", gap: 2 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 9 }}>add</span>
            Nuevo Bot
          </div>
        </div>
        {bots.map((b) => (
          <div key={b.name} style={{ background: "white", borderRadius: 8, padding: "7px 8px", border: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: `${b.color}18`, border: `1px solid ${b.color}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12, color: b.color }}>{b.icon}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 8.5, color: "#1C1C28", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
              <div style={{ fontSize: 7, color: "#8A8A99" }}>{b.platform} · {b.msgs} mensajes</div>
            </div>
            <div style={{ fontSize: 7, fontWeight: 700, color: b.active ? "#34D399" : "#8A8A99", background: b.active ? "rgba(52,211,153,0.1)" : "rgba(0,0,0,0.04)", padding: "2px 5px", borderRadius: 4, flexShrink: 0 }}>
              {b.active ? "Activo" : "Pausado"}
            </div>
            <div style={{ width: 26, height: 13, borderRadius: 7, background: b.active ? "#D1F366" : "#E0E0E0", position: "relative", flexShrink: 0 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: "white", position: "absolute", top: 2, left: b.active ? 15 : 2, boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }} />
            </div>
          </div>
        ))}
        <div style={{ marginTop: "auto", background: "rgba(209,243,102,0.07)", borderRadius: 8, padding: "7px 9px", border: "1px solid rgba(209,243,102,0.15)" }}>
          <div style={{ fontSize: 7.5, fontWeight: 700, color: "#1C1C28", marginBottom: 3 }}>Rendimiento hoy</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ v: "3.2K", l: "Mensajes" }, { v: "98%", l: "Automatizados" }, { v: "4s", l: "Resp. media" }].map(kpi => (
              <div key={kpi.l} style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 9.5, color: "#D1F366" }}>{kpi.v}</div>
                <div style={{ fontSize: 6, color: "#8A8A99" }}>{kpi.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ScaledDevice — responsively scales any fixed-size device frame ──────────────────
function ScaledDevice({ children, designW, designH }: { children: React.ReactNode; designW: number; designH: number }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const measure = () => setScale(Math.min(1, el.clientWidth / designW))
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [designW])
  return (
    <div ref={outerRef} style={{ width: "100%", height: designH * scale, overflow: "hidden" }}>
      <div style={{ width: designW, height: designH, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  )
}


// ─── Feature Data ────────────────────────────────────────────────────────────
interface FeatureDef {
  id: string
  number: string
  tag: string
  icon: string
  accent: string
  title: string
  subtitle: string
  description: string
  bullets: string[]
  device: "laptop" | "phone"
  renderType: "iframe" | "css"
  src?: string
  cssComponent?: "chat" | "automations" | "bots"
  mockupFirst: boolean
  altBg: boolean
}

const FEATURES: FeatureDef[] = [
  {
    id: "analytics",
    number: "01",
    tag: "Analítica Avanzada",
    icon: "analytics",
    accent: "#D1F366",
    title: "Inteligencia de\nNegocio en Tiempo Real",
    subtitle: "Tomá decisiones con datos reales, no intuición.",
    description:
      "Panel ejecutivo completo con KPIs actualizados al instante: mensajes enviados, clientes activos, ingresos y conversiones. Gráficos de actividad, historial de conversaciones y exportación de reportes.",
    bullets: [
      "KPIs en tiempo real — mensajes, ingresos, clientes activos",
      "Gráficos de actividad semanal y mensual",
      "Historial completo de conversaciones por canal",
      "Métricas de engagement por WhatsApp e Instagram",
      "Exportación de reportes en un clic",
    ],
    device: "laptop",
    renderType: "iframe",
    src: "/previews/dashboard.html",
    mockupFirst: false,
    altBg: false,
  },
  {
    id: "chatbots",
    number: "02",
    tag: "Chatbots IA",
    icon: "smart_toy",
    accent: "#818CF8",
    title: "Chatbots IA\nOmnicanal 24/7",
    subtitle: "Tu equipo de atención que nunca duerme.",
    description:
      "Creá bots con personalidad propia entrenados con la info de tu negocio. Atienden por WhatsApp, Instagram y Email, toman reservas, gestionan pedidos y derivan al humano cuando corresponde.",
    bullets: [
      "WhatsApp, Instagram y Email en un solo CRM",
      "IA entrenada con tu menú, catálogo y tono de voz",
      "Respuestas ilimitadas — sin costo extra por mensaje",
      "Deriva automática a humano cuando es necesario",
      "Historial de conversaciones centralizado",
    ],
    device: "laptop",
    renderType: "css",
    cssComponent: "bots",
    mockupFirst: true,
    altBg: true,
  },
  {
    id: "automations",
    number: "03",
    tag: "Automatización",
    icon: "account_tree",
    accent: "#34D399",
    title: "Flujos que\nTrabajan por Vos",
    subtitle: "Configurá una vez, funcioná para siempre.",
    description:
      "Diseñá flujos de mensajes automáticos para cada etapa del cliente: bienvenida, recordatorio de reserva, recuperación de carrito abandonado, campañas mensuales y feedback post-venta.",
    bullets: [
      "Disparadores por fecha, acción o evento del cliente",
      "Mensajes personalizados con datos del CRM",
      "Recordatorios de citas y reservas automáticos",
      "Secuencias multi-paso con lógica condicional",
      "Reportes de envíos y tasa de apertura en vivo",
    ],
    device: "laptop",
    renderType: "css",
    cssComponent: "automations",
    mockupFirst: false,
    altBg: false,
  },
  {
    id: "reservas",
    number: "04",
    tag: "Reservas & Agenda",
    icon: "calendar_today",
    accent: "#F472B6",
    title: "Agenda Digital\nSin Fricción",
    subtitle: "Tu calendario lleno, gestionado automáticamente.",
    description:
      "Los clientes reservan por WhatsApp sin necesidad de llamar. El bot verifica disponibilidad, confirma la cita y envía recordatorios. Vos solo abrís la app y ves tu agenda llena.",
    bullets: [
      "Reservas automáticas por WhatsApp sin intervención",
      "Vista de calendario semanal y mensual",
      "Confirmaciones y recordatorios automáticos",
      "Control de disponibilidad por horario y día",
      "Gestión de cancelaciones y reprogramaciones",
    ],
    device: "laptop",
    renderType: "iframe",
    src: "/previews/reservas.html",
    mockupFirst: true,
    altBg: true,
  },
  {
    id: "pos",
    number: "05",
    tag: "Punto de Venta",
    icon: "point_of_sale",
    accent: "#FBBF24",
    title: "Caja Digital\nIntegrada al Bot",
    subtitle: "Del WhatsApp directamente a tu panel de ventas.",
    description:
      "Gestioná tu catálogo de productos, procesá pedidos que entran por el bot y llevá el control de tu operación diaria. Sin papel, sin errores, sin llamadas.",
    bullets: [
      "Catálogo de productos con imágenes y precios",
      "Pedidos por WhatsApp directo al panel de caja",
      "Control de ventas diario y mensual",
      "Múltiples métodos de pago y modalidades de entrega",
      "Historial de pedidos por cliente",
    ],
    device: "laptop",
    renderType: "iframe",
    src: "/previews/pos.html",
    mockupFirst: false,
    altBg: false,
  },
  {
    id: "promotions",
    number: "06",
    tag: "Marketing & Promociones",
    icon: "campaign",
    accent: "#FB923C",
    title: "Campañas que\nConvierten de Verdad",
    subtitle: "WhatsApp tiene 98% de tasa de apertura. Usalo.",
    description:
      "Enviá campañas masivas de WhatsApp con segmentación por tipo de cliente. Programá envíos, medí resultados en vivo y optimizá cada campaña con datos reales.",
    bullets: [
      "Campañas masivas a miles de contactos segmentados",
      "Segmentación por etiquetas — VIP, Regular, Nuevo",
      "Programación automática por fecha y hora",
      "Métricas de apertura, clicks y respuestas en tiempo real",
      "Soporte de multimedia: imágenes, PDFs y videos",
    ],
    device: "laptop",
    renderType: "iframe",
    src: "/previews/promotions.html",
    mockupFirst: true,
    altBg: true,
  },
]

// ─── Stats Data ──────────────────────────────────────────────────────────────
const STATS = [
  { label: "Negocios activos", value: 800, prefix: "", suffix: "+", isCounter: true },
  { label: "Mensajes por día", value: 2400, prefix: "", suffix: "+", isCounter: true },
  { label: "Satisfacción", value: 98, prefix: "", suffix: "%", isCounter: true },
  { label: "Módulos integrados", value: 6, prefix: "", suffix: "", isCounter: true },
]

// ─── Main Component ──────────────────────────────────────────────────────────
export function CapacidadesPage() {
  const pageRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      // Hero entrance
      gsap.from("[data-cap-nav]", { autoAlpha: 0, y: -30, duration: 0.7, ease: "power3.out" })
      gsap.from("[data-cap-badge]", { autoAlpha: 0, y: 24, duration: 0.7, delay: 0.25, ease: "power2.out" })
      gsap.from("[data-cap-word]", {
        autoAlpha: 0, y: 50, rotationX: -20,
        stagger: 0.06, duration: 0.75, delay: 0.4,
        ease: "back.out(1.5)",
        transformOrigin: "50% 50% -20px",
      })
      gsap.from("[data-cap-sub]", { autoAlpha: 0, y: 20, duration: 0.7, delay: 0.85, ease: "power2.out" })
      gsap.from("[data-cap-scroll-hint]", { autoAlpha: 0, y: 10, duration: 0.6, delay: 1.1, ease: "power2.out" })

      // Stats
      gsap.from("[data-stat-card]", {
        autoAlpha: 0, y: 40, stagger: 0.1, duration: 0.8, ease: "power3.out",
        scrollTrigger: { trigger: "[data-stats-row]", start: "top 82%", once: true },
      })

      // Feature sections
      const sections = gsap.utils.toArray<HTMLElement>("[data-feature-section]")
      sections.forEach((section, i) => {
        const textEl = section.querySelector("[data-feat-text]")
        const deviceEl = section.querySelector("[data-feat-device]")
        const bullets = section.querySelectorAll("[data-feat-bullet]")
        const badgeEl = section.querySelector("[data-feat-badge]")
        const titleEl = section.querySelector("[data-feat-title]")

        const mockupFirst = section.getAttribute("data-feature-section") === String(i)
          ? FEATURES[i]?.mockupFirst
          : false

        const textDir = mockupFirst ? 60 : -60
        const deviceDir = mockupFirst ? -80 : 80

        if (badgeEl) gsap.from(badgeEl, {
          autoAlpha: 0, x: textDir * 0.5, duration: 0.6, ease: "power2.out",
          scrollTrigger: { trigger: section, start: "top 78%", once: true },
        })
        if (titleEl) gsap.from(titleEl, {
          autoAlpha: 0, x: textDir, duration: 0.9, ease: "power3.out",
          scrollTrigger: { trigger: section, start: "top 76%", once: true },
        })
        if (textEl) gsap.from(textEl, {
          autoAlpha: 0, x: textDir * 0.7, duration: 0.9, ease: "power3.out",
          scrollTrigger: { trigger: section, start: "top 74%", once: true },
        })
        if (deviceEl) gsap.from(deviceEl, {
          autoAlpha: 0, x: deviceDir, y: 30, duration: 1.1, ease: "power3.out",
          scrollTrigger: { trigger: section, start: "top 74%", once: true },
        })
        if (bullets.length) gsap.from(bullets, {
          autoAlpha: 0, x: textDir * 0.4, stagger: 0.09, duration: 0.65, ease: "power2.out",
          scrollTrigger: { trigger: section, start: "top 68%", once: true },
        })
      })

      // Perpetual device float
      gsap.utils.toArray<HTMLElement>("[data-feat-device]").forEach((el, i) => {
        gsap.to(el, { y: -12, duration: 2.8 + i * 0.4, ease: "sine.inOut", repeat: -1, yoyo: true })
      })

      // Ambient orbs
      gsap.utils.toArray<HTMLElement>("[data-orb]").forEach((el, i) => {
        gsap.to(el, { scale: 1.15, duration: 4 + i * 1.5, ease: "sine.inOut", repeat: -1, yoyo: true })
      })

      // CTA
      gsap.from("[data-cap-cta]", {
        autoAlpha: 0, scale: 0.94, y: 50, duration: 1.0, ease: "power3.out",
        scrollTrigger: { trigger: "[data-cap-cta]", start: "top 80%", once: true },
      })
    },
    { scope: pageRef }
  )

  return (
    <div
      ref={pageRef}
      style={{ background: "#0F0F17", color: "white", minHeight: "100vh", fontFamily: "Inter, sans-serif", overflowX: "hidden" }}
    >
      {/* Ambient orbs */}
      <div data-orb className="fixed top-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(209,243,102,0.05) 0%, transparent 70%)", zIndex: 0 }} />
      <div data-orb className="fixed bottom-1/3 left-0 w-[500px] h-[500px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(129,140,248,0.04) 0%, transparent 70%)", zIndex: 0 }} />

      {/* ─── Navbar ──────────────────────────────────────────────── */}
      <nav
        data-cap-nav
        className="sticky top-0 z-50 w-full flex items-center justify-between px-5 md:px-16 py-4"
        style={{
          background: "rgba(15,15,23,0.92)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Link
          href="/"
          className="flex items-center gap-2 group"
          style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 600, textDecoration: "none", transition: "color 0.2s" }}
          onMouseEnter={(e) => gsap.to(e.currentTarget, { color: "#D1F366", x: -3, duration: 0.2 })}
          onMouseLeave={(e) => gsap.to(e.currentTarget, { color: "rgba(255,255,255,0.55)", x: 0, duration: 0.2 })}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
          Volver al inicio
        </Link>

        <span className="text-xl font-black tracking-tighter" style={{ color: "#D1F366" }}>UCOBOT</span>

        <Link href="/register">
          <button
            className="px-6 py-2.5 rounded-full text-sm font-black uppercase tracking-wider"
            style={{ background: "#D1F366", color: "#1C1C28" }}
            onMouseEnter={(e) => gsap.to(e.currentTarget, { scale: 1.05, boxShadow: "0 0 24px rgba(209,243,102,0.3)", duration: 0.2 })}
            onMouseLeave={(e) => gsap.to(e.currentTarget, { scale: 1, boxShadow: "none", duration: 0.2 })}
          >
            Comenzar gratis
          </button>
        </Link>
      </nav>

      {/* ─── Hero ────────────────────────────────────────────────── */}
      <section className="relative pt-20 pb-16 px-6 md:px-20 max-w-[1320px] mx-auto text-center" style={{ zIndex: 1 }}>
        {/* Badge */}
        <div data-cap-badge className="inline-flex items-center gap-3 mb-8">
          <span className="inline-block h-[1px] w-10" style={{ background: "#D1F366" }} />
          <span className="text-xs font-black uppercase tracking-[0.35em]" style={{ color: "#D1F366" }}>
            Plataforma Completa
          </span>
          <span className="inline-block h-[1px] w-10" style={{ background: "#D1F366" }} />
        </div>

        {/* Title */}
        <h1
          className="font-black leading-[0.88] tracking-tighter mb-8"
          style={{ fontSize: "clamp(3.5rem, 9vw, 7rem)", perspective: "600px" }}
        >
          {"CAPACIDADES".split("").map((ch, i) => (
            <span
              key={i}
              data-cap-word
              style={{ display: "inline-block", color: i < 5 ? "white" : "#D1F366" }}
            >
              {ch === " " ? "\u00A0" : ch}
            </span>
          ))}
          <br />
          {"DEL SISTEMA".split(" ").map((w, i) => (
            <span key={i} data-cap-word style={{ display: "inline-block", marginRight: "0.2em", color: "white" }}>
              {w}
            </span>
          ))}
        </h1>

        {/* Sub */}
        <p
          data-cap-sub
          className="text-lg md:text-xl font-medium leading-relaxed max-w-2xl mx-auto"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          Desde chatbots IA hasta punto de venta — todo integrado, todo conectado,
          todo diseñado para que tu negocio crezca sin intervención manual.
        </p>

        {/* Scroll hint */}
        <div data-cap-scroll-hint className="flex items-center justify-center gap-2 mt-12" style={{ color: "rgba(255,255,255,0.3)" }}>
          <span className="text-xs uppercase tracking-[0.3em] font-semibold">Explorá todo abajo</span>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>keyboard_arrow_down</span>
        </div>
      </section>

      {/* ─── Stats Bar ───────────────────────────────────────────── */}
      <div data-stats-row className="px-6 md:px-20 max-w-[1320px] mx-auto mb-16 md:mb-28" style={{ zIndex: 1, position: "relative" }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {STATS.map((s, i) => (
            <div
              key={i}
              data-stat-card
              className="rounded-2xl p-5 md:p-8 text-center"
              style={{ background: "rgba(28,28,40,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div
                className="font-black leading-none mb-2"
                style={{ fontSize: "clamp(2.2rem, 4vw, 3rem)", color: "#D1F366" }}
              >
                {s.isCounter ? (
                  <AnimatedCounter to={s.value} prefix={s.prefix} suffix={s.suffix} />
                ) : (
                  `${s.prefix}${s.value}${s.suffix}`
                )}
              </div>
              <div className="text-sm font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Feature Sections ────────────────────────────────────── */}
      {FEATURES.map((feat, i) => (
        <section
          key={feat.id}
          data-feature-section={i}
          id={feat.id}
          className="relative py-16 md:py-24 px-6 md:px-20"
          style={{
            background: feat.altBg ? "rgba(28,28,40,0.35)" : "transparent",
            borderTop: "1px solid rgba(255,255,255,0.04)",
            zIndex: 1,
          }}
        >
          <div className="max-w-[1320px] mx-auto">
            <div className={`flex flex-col ${feat.mockupFirst ? "lg:flex-row-reverse" : "lg:flex-row"} items-center gap-12 lg:gap-20`}>
              {/* ── Text block ── */}
              <div className="flex-1 min-w-0 lg:min-w-[320px]">
                {/* Badge */}
                <div data-feat-badge className="flex items-center gap-3 mb-5">
                  <span
                    className="text-[10px] font-black uppercase tracking-[0.4em] px-3 py-1.5 rounded-full"
                    style={{ background: `${feat.accent}18`, color: feat.accent, border: `1px solid ${feat.accent}30` }}
                  >
                    {feat.tag}
                  </span>
                  <span className="text-sm font-black opacity-20">{feat.number}</span>
                </div>

                {/* Title */}
                <h2
                  data-feat-title
                  className="font-black tracking-tighter leading-none mb-5"
                  style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.8rem)" }}
                >
                  {feat.title.split("\n").map((line, li) => (
                    <span key={li} style={{ display: "block" }}>{line}</span>
                  ))}
                </h2>

                {/* Subtitle */}
                <p
                  data-feat-text
                  className="text-base font-semibold mb-4"
                  style={{ color: feat.accent }}
                >
                  {feat.subtitle}
                </p>

                {/* Description */}
                <p
                  data-feat-text
                  className="text-base leading-relaxed mb-8 max-w-lg"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                >
                  {feat.description}
                </p>

                {/* Bullets */}
                <ul className="space-y-3">
                  {feat.bullets.map((bullet, bi) => (
                    <li
                      key={bi}
                      data-feat-bullet
                      className="flex items-start gap-3 text-sm font-medium"
                      style={{ color: "rgba(255,255,255,0.75)" }}
                    >
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0"
                        style={{ background: `${feat.accent}22`, border: `1px solid ${feat.accent}44` }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 11, color: feat.accent }}>check</span>
                      </span>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>

              {/* ── Device Mockup ── */}
              <div
                data-feat-device
                className={`relative flex items-center justify-center ${
                  feat.device === "phone" ? "w-full max-w-[280px] mx-auto lg:mx-0 lg:w-[280px] flex-shrink-0" : "w-full lg:w-[588px] flex-shrink-0"
                }`}
              >
                {/* Glow */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse 80% 70% at 50% 50%, ${feat.accent}14 0%, transparent 70%)`,
                    zIndex: 0,
                  }}
                />
                <div style={{ position: "relative", zIndex: 1, width: "100%" }}>
                  {feat.device === "laptop" ? (
                    <ScaledDevice designW={588} designH={404}>
                      <LaptopFrame>
                        {feat.renderType === "iframe" && feat.src ? (
                          <LaptopScreen src={feat.src} />
                        ) : feat.cssComponent === "bots" ? (
                          <BotsScreen />
                        ) : feat.cssComponent === "automations" ? (
                          <AutomationsScreen />
                        ) : (
                          <ChatScreen />
                        )}
                      </LaptopFrame>
                    </ScaledDevice>
                  ) : (
                    <ScaledDevice designW={264} designH={556}>
                      <PhoneFrame>
                        {feat.renderType === "iframe" && feat.src ? (
                          <PhoneScreen src={feat.src} />
                        ) : feat.cssComponent === "chat" ? (
                          <ChatScreen />
                        ) : (
                          <AutomationsScreen />
                        )}
                      </PhoneFrame>
                    </ScaledDevice>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* ─── CTA Section ─────────────────────────────────────────── */}
      <section data-cap-cta className="py-20 md:py-32 px-6 md:px-20 relative" style={{ zIndex: 1 }}>
        <div
          className="max-w-[900px] mx-auto rounded-3xl p-10 md:p-16 lg:p-24 text-center relative overflow-hidden"
          style={{ background: "#1C1C28", border: "1px solid rgba(209,243,102,0.15)" }}
        >
          {/* Glow */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(209,243,102,0.08) 0%, transparent 100%)" }} />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full" style={{ background: "rgba(209,243,102,0.1)", border: "1px solid rgba(209,243,102,0.2)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#D1F366" }}>rocket_launch</span>
              <span className="text-xs font-black uppercase tracking-[0.35em]" style={{ color: "#D1F366" }}>Listo para arrancar</span>
            </div>

            <h2 className="font-black tracking-tighter leading-none mb-6" style={{ fontSize: "clamp(2.5rem, 5vw, 4.5rem)" }}>
              EMPEZÁ HOY
            </h2>
            <p className="text-lg font-medium mb-10 max-w-lg mx-auto" style={{ color: "rgba(255,255,255,0.55)" }}>
              Todo lo que viste arriba, activo en tu negocio desde el primer día.
              Sin programación, sin técnicos, sin complicaciones.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/register">
                <button
                  className="px-10 py-4 rounded-full font-black text-sm uppercase tracking-wider"
                  style={{ background: "#D1F366", color: "#1C1C28" }}
                  onMouseEnter={(e) => gsap.to(e.currentTarget, { scale: 1.05, boxShadow: "0 0 40px rgba(209,243,102,0.35)", duration: 0.25 })}
                  onMouseLeave={(e) => gsap.to(e.currentTarget, { scale: 1, boxShadow: "none", duration: 0.25 })}
                >
                  Crear cuenta gratis
                </button>
              </Link>
              <Link href="/dashboard">
                <button
                  className="px-10 py-4 rounded-full font-black text-sm uppercase tracking-wider"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white" }}
                  onMouseEnter={(e) => gsap.to(e.currentTarget, { backgroundColor: "rgba(255,255,255,0.11)", duration: 0.25 })}
                  onMouseLeave={(e) => gsap.to(e.currentTarget, { backgroundColor: "rgba(255,255,255,0.06)", duration: 0.25 })}
                >
                  Ver Dashboard
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────── */}
      <footer
        className="px-6 md:px-20 py-10 md:py-12"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)", position: "relative", zIndex: 1 }}
      >
        <div className="max-w-[1320px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-xl font-black tracking-tighter" style={{ color: "#D1F366" }}>UCOBOT</span>
          <span className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
            Una solución desarrollada por{" "}
            <span style={{ color: "rgba(255,255,255,0.6)" }}>CODEA DESARROLLOS</span>
          </span>
          <Link href="/" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            ← Volver al inicio
          </Link>
        </div>
      </footer>
    </div>
  )
}
