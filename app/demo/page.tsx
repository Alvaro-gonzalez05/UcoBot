"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Bot, Loader2, Sparkles, CheckCircle2, Send, Check, Pencil, ArrowRight, X } from "lucide-react"
import { FormattedMessage } from "@/components/demo/formatted-message"

// ── Constants ──────────────────────────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  register_clients: "Registro de clientes",
  take_orders: "Toma de pedidos",
  manage_appointments: "Agendado de citas",
  lead_qualification: "Calificación de leads",
  loyalty_points: "Puntos de fidelización",
  custom_forms: "Formularios conversacionales",
}

// Preview sidebar uses Material Symbols (rendered with material-symbols-outlined)
const FIXED_SECTIONS = [
  { id: "dashboard", label: "Dashboard", materialIcon: "dashboard", lucideIcon: "LayoutDashboard" },
  { id: "mensajes",  label: "Mensajes",  materialIcon: "chat_bubble", lucideIcon: "MessageSquare" },
  { id: "bots",      label: "Chatbots",  materialIcon: "forum",       lucideIcon: "Bot" },
  { id: "automations", label: "Automatizaciones", materialIcon: "account_tree", lucideIcon: "Zap" },
]

const FIXED_SECTION_IDS = new Set([...FIXED_SECTIONS.map((s) => s.id), "chat"])

const BUILDING_STEPS = [
  "Analizando tu negocio...",
  "Eligiendo el nombre del bot...",
  "Redactando su personalidad (prompt)...",
  "Seleccionando funcionalidades ideales...",
  "Configurando la calificación de leads...",
  "Armando las secciones de tu panel...",
]

// Material Symbols names — used for the animated preview sidebar in demo/page.tsx
const MATERIAL_ICON_MAP: Record<string, string> = {
  clients:        "group",
  orders:         "shopping_cart",
  reservations:   "calendar_month",
  promotions:     "local_offer",
  forms:          "description",
  punto_de_venta: "point_of_sale",
  finanzas:       "account_balance_wallet",
}

// Lucide icon names — must match SIDEBAR_ICONS in [sessionId]/page.tsx
const LUCIDE_ICON_MAP: Record<string, string> = {
  clients:        "Users",
  orders:         "ShoppingBag",
  reservations:   "Calendar",
  promotions:     "Tag",
  forms:          "FileText",
  punto_de_venta: "Package",
  finanzas:       "Wallet",
}

const WELCOME_CHIPS = [
  { icon: "💬", label: "Mensajes automáticos" },
  { icon: "🤖", label: "Chatbot con IA" },
  { icon: "📅", label: "Reservas" },
  { icon: "🛒", label: "Gestión de pedidos" },
  { icon: "🎯", label: "Calificación de leads" },
  { icon: "📊", label: "Panel de control" },
]

// ── Types ──────────────────────────────────────────────────────────────────────

type ChatStage = "welcome" | "ask_business" | "ask_goals" | "ask_followup" | "ask_tags" | "processing" | "done"

interface AiSection {
  id: string
  label: string
  icon: string
  justification: string
  visible: boolean
}

interface SummaryData {
  features: string[]
  featureJustifications: Record<string, string>
  botName: string
  businessSummary: string
  sessionId: string
  aiSections: AiSection[]
}

interface ConfirmedSection {
  id: string
  label: string
  visible: true
  icon: string
}

interface CapabilityCard {
  icon: string
  title: string
  description: string
}

interface CapabilitiesData {
  intro: string
  capabilities: CapabilityCard[]
  outro: string
}

interface ChatMessage {
  id: string
  role: "bot" | "user"
  content: string
  type?: "summary" | "capabilities"
  summaryData?: SummaryData
  capabilitiesData?: CapabilitiesData
}

interface SidebarPreviewItem {
  id: string
  label: string
  materialIcon: string
  isFixed: boolean
}

interface SavedDemoSession {
  sessionId: string
  contactName: string
  botName: string
  businessName: string
  createdAt: number
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ── Component ──────────────────────────────────────────────────────────────────

export default function DemoPage() {
  const router = useRouter()
  const stageRef = useRef<ChatStage>("welcome")
  const [stage, setStage] = useState<ChatStage>("welcome")
  const [welcomeInput, setWelcomeInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [contactName, setContactName] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [goalsText, setGoalsText] = useState("")
  const followupTextRef = useRef("")
  const [buildingStepIndex, setBuildingStepIndex] = useState(-1)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [showBuilding, setShowBuilding] = useState(false)
  const [revealName, setRevealName] = useState("")
  const [revealPrompt, setRevealPrompt] = useState("")
  const [sidebarItems, setSidebarItems] = useState<SidebarPreviewItem[]>([])
  const [savedSession, setSavedSession] = useState<SavedDemoSession | null>(null)
  const [testSessionId, setTestSessionId] = useState<string | null>(null)
  const [configuredSessionId, setConfiguredSessionId] = useState<string | null>(null)
  const configuredFeaturesRef = useRef<string[]>([])
  const [showPromptPanel, setShowPromptPanel] = useState(false)
  const [botPrompt, setBotPrompt] = useState("")
  const [promptVersion, setPromptVersion] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ucobot_demo_session")
      if (raw) {
        const parsed: SavedDemoSession = JSON.parse(raw)
        if (Date.now() - parsed.createdAt < 48 * 60 * 60 * 1000) {
          setSavedSession(parsed)
        } else {
          localStorage.removeItem("ucobot_demo_session")
        }
      }
    } catch {}
  }, [])

  const scrollBottom = () =>
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80)

  const appendBot = (content: string, extra?: Partial<ChatMessage>) => {
    setMessages((prev) => [
      ...prev,
      { id: `b-${Date.now()}-${Math.random()}`, role: "bot", content, ...extra },
    ])
    scrollBottom()
  }

  const handleWelcomeSubmit = async () => {
    const name = welcomeInput.trim()
    if (!name) return
    setContactName(name)
    stageRef.current = "ask_business"
    setStage("ask_business")
    setWelcomeInput("")
    await delay(550)
    setIsTyping(true)
    await delay(900)
    setIsTyping(false)
    appendBot(
      `¡Mucho gusto, **${name.split(" ")[0]}**! 🙌\n\n¿Cuál es el nombre de tu negocio o empresa?`
    )
  }

  // Restore a saved session: rebuild the full demo screen (sidebar + chat +
  // config assistant + action buttons) without redoing the onboarding.
  const resumeSession = async (saved: SavedDemoSession) => {
    setContactName(saved.contactName)
    setBusinessName(saved.businessName)
    stageRef.current = "done"
    setStage("done")
    setIsTyping(true)
    try {
      const res = await fetch(`/api/demo/chat?sessionId=${saved.sessionId}`)
      const data = await res.json()
      if (!res.ok || !data.session) throw new Error("not found")
      const session = data.session

      setConfiguredSessionId(saved.sessionId)
      configuredFeaturesRef.current = session.features || []
      if (session.business_summary) setGoalsText(session.business_summary)

      // Rebuild the sidebar from the stored config
      const cfg: { id: string; label: string; visible: boolean }[] = Array.isArray(session.sidebar_config) ? session.sidebar_config : []
      const items: SidebarPreviewItem[] = []
      for (const f of FIXED_SECTIONS) {
        items.push({ id: f.id, label: f.label, materialIcon: f.materialIcon, isFixed: true })
      }
      for (const s of cfg) {
        if (FIXED_SECTION_IDS.has(s.id) || s.visible !== true) continue
        items.push({ id: s.id, label: s.label || s.id, materialIcon: MATERIAL_ICON_MAP[s.id] || "circle", isFixed: false })
      }
      setSidebarItems(items)

      setIsTyping(false)
      appendBot(
        `¡Hola de nuevo, **${saved.contactName.split(" ")[0]}**! 👋\n\nTu bot **${session.bot_name}** para **${saved.businessName}** sigue configurado y listo.\n\n- Tocá **Probar bot** para chatear como un cliente\n- Escribime acá si querés **ajustar algo** o preguntar sobre la plataforma\n- O tocá **Activar cuenta** cuando quieras dejarlo andando de verdad`
      )
    } catch {
      setIsTyping(false)
      try { localStorage.removeItem("ucobot_demo_session") } catch {}
      setSavedSession(null)
      stageRef.current = "welcome"
      setStage("welcome")
    }
  }

  // Build a plain-text transcript of the conversation so far (+ the latest user turn),
  // so the AI never re-asks something already answered and can personalize.
  const buildTranscript = (latestUser?: string) => {
    const turns = [...messages]
    if (latestUser) turns.push({ id: "live", role: "user", content: latestUser })
    return turns
      .filter((m) => m.type !== "summary" && m.content)
      .map((m) => `${m.role === "user" ? "Cliente" : "Asistente"}: ${m.content}`)
      .join("\n")
  }

  const handleSend = async () => {
    const text = inputValue.trim()
    if (!text || stageRef.current === "processing") return
    setInputValue("")

    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content: text }])
    scrollBottom()

    if (stageRef.current === "ask_business") {
      setBusinessName(text)
      stageRef.current = "ask_goals"
      setStage("ask_goals")
      setIsTyping(true)
      await delay(900)
      setIsTyping(false)
      appendBot(
        `¡Genial, **${text}**! 👏\n\n¿A qué se dedica el negocio? Contame lo que hacen, quiénes son sus clientes y qué tipo de consultas o pedidos reciben habitualmente.`
      )
    } else if (stageRef.current === "ask_goals") {
      setGoalsText(text)
      stageRef.current = "ask_followup"
      setStage("ask_followup")
      setIsTyping(true)
      const transcript = buildTranscript(text)
      try {
        const res = await fetch("/api/demo/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: "react_to_goals", contactName, businessName, userMessage: text, transcript }),
        })
        const data = await res.json()
        setIsTyping(false)
        if (Array.isArray(data.capabilities) && data.capabilities.length > 0) {
          // Texto plano en content para que el transcript conserve lo mostrado
          const asText = `${data.intro}\nCon UcoBot vas a poder: ${data.capabilities.map((c: CapabilityCard) => c.title).join(", ")}.\n${data.outro}`
          appendBot(asText, {
            type: "capabilities",
            capabilitiesData: { intro: data.intro || "", capabilities: data.capabilities, outro: data.outro || "" },
          })
        } else {
          appendBot(data.reply || "¡Perfecto! Contame más: ¿cuál es el mayor problema hoy en la atención al cliente y de dónde te llegan los clientes?")
        }
      } catch {
        setIsTyping(false)
        appendBot("¡Perfecto! Para configurarlo bien: ¿cuál es el mayor problema hoy en la atención al cliente y de dónde te llegan los clientes?")
      }
    } else if (stageRef.current === "ask_followup") {
      followupTextRef.current = text
      setIsTyping(true)
      let replyMsg = "Perfecto, con todo esto ya puedo configurarlo bien 🎯\n\nVoy a analizar tu negocio y armar la configuración ahora mismo..."
      let needsTags = false
      const transcript = buildTranscript(text)
      try {
        const res = await fetch("/api/demo/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: "react_to_followup", contactName, businessName, userMessage: text, transcript }),
        })
        const data = await res.json()
        if (data.reply) replyMsg = data.reply
        needsTags = data.needsTagQuestion === true
      } catch {}
      setIsTyping(false)
      appendBot(replyMsg)
      if (needsTags) {
        stageRef.current = "ask_tags"
        setStage("ask_tags")
      } else {
        stageRef.current = "processing"
        setStage("processing")
        await delay(400)
        setShowBuilding(true)
        scrollBottom()
        const fullDesc = `${goalsText}\n\nPain points y contexto operativo: ${text}`
        runProcessing(contactName, businessName, fullDesc)
      }
    } else if (stageRef.current === "ask_tags") {
      stageRef.current = "processing"
      setStage("processing")
      setIsTyping(true)
      await delay(600)
      setIsTyping(false)
      appendBot("Perfecto, lo tengo en cuenta para configurar la calificación de leads 🎯\n\nAhora sí, voy a armar todo...")
      await delay(400)
      setShowBuilding(true)
      scrollBottom()
      const fullDesc = `${goalsText}\n\nPain points y contexto operativo: ${followupTextRef.current}\n\nCriterios de calificación de leads: ${text}`
      runProcessing(contactName, businessName, fullDesc)
    } else if (stageRef.current === "done") {
      // Seguir hablando con el asistente de configuración después de armar el bot
      setIsTyping(true)
      const history = messages
        .filter((m) => m.type !== "summary" && m.content)
        .map((m) => ({ role: m.role === "user" ? "user" : "model", content: m.content }))
      try {
        const res = await fetch("/api/demo/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessName,
            businessSummary: goalsText,
            features: configuredFeaturesRef.current,
            history,
            message: text,
            sessionId: configuredSessionId,
          }),
        })
        const data = await res.json()
        setIsTyping(false)
        if (Array.isArray(data.features)) configuredFeaturesRef.current = data.features
        if (typeof data.personalityPrompt === "string" && data.personalityPrompt) {
          // El configurador actualizó el prompt — reflejarlo en vivo en el panel
          setBotPrompt(data.personalityPrompt)
          setPromptVersion((v) => v + 1)
        }
        appendBot(data.reply || "Disculpá, no pude responder ahora. Probá de nuevo en un momento.")
      } catch {
        setIsTyping(false)
        appendBot("Hubo un error de conexión. Probá de nuevo en un momento.")
      }
    }

    inputRef.current?.focus()
  }

  const runProcessing = async (name: string, biz: string, desc: string) => {
    setRevealName("")
    setRevealPrompt("")
    setBuildingStepIndex(0)
    await delay(850)
    setCompletedSteps([0])

    const apiPromise = fetch("/api/demo/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_name: name,
        business_name: biz,
        business_description: desc,
        contact_email: "",
      }),
    }).then((r) => r.json())

    setBuildingStepIndex(1)
    await delay(850)
    setCompletedSteps([0, 1])

    setBuildingStepIndex(2)
    await delay(850)
    setCompletedSteps([0, 1, 2])

    setBuildingStepIndex(3)
    await delay(850)
    setCompletedSteps([0, 1, 2, 3])

    setBuildingStepIndex(4)
    await delay(850)
    setCompletedSteps([0, 1, 2, 3, 4])

    setBuildingStepIndex(5)
    const data = await apiPromise

    if (!data.sessionId) {
      setShowBuilding(false)
      setBuildingStepIndex(-1)
      setCompletedSteps([])
      stageRef.current = "ask_goals"
      setStage("ask_goals")
      appendBot(
        "Ups, hubo un error al conectarme con la IA 😕 Podés intentarlo de nuevo escribiendo tu descripción."
      )
      return
    }

    await delay(600)
    setCompletedSteps([0, 1, 2, 3, 4, 5])
    // Reveal de la preconfiguración: nombre + personalidad asignada
    setRevealName(data.botNameSuggestion || "Tu asistente")
    if (data.personalityPrompt) {
      setRevealPrompt(data.personalityPrompt)
      setBotPrompt(data.personalityPrompt)
    }
    scrollBottom()
    await delay(1700)
    setShowBuilding(false)
    await delay(350)

    setConfiguredSessionId(data.sessionId)
    configuredFeaturesRef.current = data.features || []

    // Save session for resume functionality
    try {
      localStorage.setItem("ucobot_demo_session", JSON.stringify({
        sessionId: data.sessionId,
        contactName: name,
        botName: data.botNameSuggestion || "Bot",
        businessName: biz,
        createdAt: Date.now(),
      }))
    } catch {}

    // Sidebar preview — only visible sections, use Material icons
    const visibleAiSections = (data.sidebarConfig || []).filter(
      (s: any) => !FIXED_SECTION_IDS.has(s.id) && s.visible === true
    )

    for (const s of FIXED_SECTIONS) {
      await delay(320)
      setSidebarItems((prev) => [
        ...prev,
        { id: s.id, label: s.label, materialIcon: s.materialIcon, isFixed: true },
      ])
    }
    for (const s of visibleAiSections) {
      await delay(320)
      setSidebarItems((prev) => [
        ...prev,
        { id: s.id, label: s.label || s.id, materialIcon: MATERIAL_ICON_MAP[s.id] || "circle", isFixed: false },
      ])
    }

    await delay(450)

    // All AI sections for card — use Lucide icon names so DB matches [sessionId]/page.tsx
    const allAiSections: AiSection[] = (data.sidebarConfig || [])
      .filter((s: any) => !FIXED_SECTION_IDS.has(s.id))
      .map((s: any) => ({
        id: s.id,
        label: s.label || s.id,
        icon: LUCIDE_ICON_MAP[s.id] || "FileText",
        justification: s.justification || "",
        visible: s.visible === true,
      }))

    const enabledSections = allAiSections.filter((s) => s.visible).map((s) => s.label)
    const disabledSections = allAiSections.filter((s) => !s.visible).map((s) => s.label)
    const featureNames = (data.features || []).map((f: string) => FEATURE_LABELS[f] || f)

    let readyMsg = `¡Listo, **${name.split(" ")[0]}**! Configuré **${data.botNameSuggestion}** para **${biz}** 🎯\n\n`

    if (featureNames.length > 0) {
      readyMsg += `Activé **${featureNames.length} funcionalidad${featureNames.length === 1 ? "" : "es"}**: ${featureNames.join(", ")}.\n\n`
    }

    if (enabledSections.length > 0) {
      readyMsg += `Habilité **${enabledSections.length} sección${enabledSections.length === 1 ? "" : "es"}** en tu panel: **${enabledSections.join(", ")}**.`
    }

    if (disabledSections.length > 0) {
      readyMsg += ` Desactivé **${disabledSections.join("** y **")}** porque no aplican directamente a este tipo de negocio — pero podés activarlas desde abajo si las necesitás.`
    }

    readyMsg += `\n\nRevisá el detalle, ajustá nombres o secciones y cuando estés listo tocá "Probar mi bot" 👇`

    appendBot(readyMsg)
    await delay(300)
    appendBot("", {
      type: "summary",
      summaryData: {
        features: data.features || [],
        featureJustifications: data.featureJustifications || {},
        botName: data.botNameSuggestion || "Bot",
        businessSummary: data.businessSummary || "",
        sessionId: data.sessionId,
        aiSections: allAiSections,
      },
    })

    const gaps: string[] = data.featureGaps || []
    if (gaps.length > 0) {
      await delay(800)
      const gapList = gaps.map((g: string) => `• ${g}`).join("\n")
      appendBot(
        `💡 **Una cosa más:** noté que mencionaste algunas funcionalidades que UcoBot todavía no tiene integradas:\n\n${gapList}\n\nEstas se pueden agregar como nuevas features — cada pedido suma al desarrollo de la plataforma. Si te interesa, nuestro equipo puede evaluarlo para vos.`
      )
    }

    stageRef.current = "done"
    setStage("done")
  }

  const handleGoToDemo = async (sessionId: string, confirmedSections: ConfirmedSection[]) => {
    await fetch("/api/demo/configure", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        sidebar_config: [
          // Use Lucide icon names — must match SIDEBAR_ICONS in [sessionId]/page.tsx
          ...FIXED_SECTIONS.map((s) => ({ id: s.id, label: s.label, visible: true, icon: s.lucideIcon })),
          ...confirmedSections,
        ],
      }),
    })
    // Stay in the same screen — open the bot test inline (no navigation)
    setTestSessionId(sessionId)
  }

  const inputDisabled = stage === "processing"
  const canSend = inputValue.trim().length > 0 && !inputDisabled

  const inputPlaceholder =
    stage === "processing"
      ? "Analizando tu negocio..."
      : stage === "done"
      ? "¿Querés ajustar algo o preguntarme sobre la plataforma?"
      : stage === "ask_business"
      ? "Nombre de tu negocio..."
      : stage === "ask_goals"
      ? "¿A qué se dedica el negocio y cómo atienden a sus clientes?"
      : stage === "ask_tags"
      ? "Ej: Lead Caliente / Frío, Inversor / Comprador Final..."
      : "Problemas actuales, canales de entrada, ¿tenés algo automatizado?"

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
    <AnimatePresence mode="wait">

      {/* ══ WELCOME ══════════════════════════════════════════════════════════ */}
      {stage === "welcome" && (
        <motion.div
          key="welcome"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.3 }}
          className="min-h-screen bg-black flex flex-col"
        >
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
            <div className="w-8 h-8 rounded-lg bg-[#CCFF00] flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-black" />
            </div>
            <div>
              <span className="text-white text-sm font-bold tracking-widest">UCOBOT</span>
              <span className="text-zinc-600 text-xs ml-2">· Demo</span>
            </div>
          </div>

          {/* Resume session screen */}
          {savedSession ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
                className="w-20 h-20 rounded-2xl bg-[#CCFF00] flex items-center justify-center shadow-[0_0_40px_rgba(204,255,0,0.2)] mb-7"
              >
                <Bot className="w-10 h-10 text-black" />
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.4 }}
                className="text-white text-2xl md:text-3xl font-bold text-center mb-3 tracking-tight"
              >
                Hola de nuevo,{" "}
                <span className="text-[#CCFF00]">{savedSession.contactName.split(" ")[0]}</span>! 👋
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24, duration: 0.4 }}
                className="text-zinc-400 text-center max-w-sm text-sm leading-relaxed mb-2"
              >
                Tu bot <span className="text-white font-semibold">{savedSession.botName}</span> para{" "}
                <span className="text-white font-semibold">{savedSession.businessName}</span> ya está
                configurado y listo para probar.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32, duration: 0.4 }}
                className="flex flex-col sm:flex-row gap-3 mt-8"
              >
                <button
                  onClick={() => resumeSession(savedSession)}
                  className="flex items-center justify-center gap-2 bg-[#CCFF00] text-black font-semibold px-6 py-3 rounded-xl hover:bg-[#b8e600] active:scale-95 transition-all text-sm"
                >
                  Volver a mi demo
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    try { localStorage.removeItem("ucobot_demo_session") } catch {}
                    setSavedSession(null)
                  }}
                  className="flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-700 text-zinc-300 font-medium px-6 py-3 rounded-xl hover:bg-zinc-800 active:scale-95 transition-all text-sm"
                >
                  Crear nueva configuración
                </button>
              </motion.div>
            </div>
          ) : (
            /* Normal welcome */
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
                className="relative mb-7"
              >
                <div className="w-20 h-20 rounded-2xl bg-[#CCFF00] flex items-center justify-center shadow-[0_0_40px_rgba(204,255,0,0.2)]">
                  <Bot className="w-10 h-10 text-black" />
                </div>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.4 }}
                className="text-white text-3xl md:text-4xl font-bold text-center mb-3 tracking-tight"
              >
                Hola, bienvenido a{" "}
                <span className="text-[#CCFF00]">UcoBot</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.26, duration: 0.4 }}
                className="text-zinc-400 text-center max-w-md text-sm leading-relaxed mb-10"
              >
                Voy a ayudarte a preconfigurar tu espacio de trabajo para gestionar tu negocio con
                inteligencia artificial. Solo necesito hacerte unas preguntas rápidas.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.34, duration: 0.4 }}
                className="flex flex-wrap justify-center gap-2 max-w-lg"
              >
                {WELCOME_CHIPS.map((chip) => (
                  <span
                    key={chip.label}
                    className="inline-flex items-center bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs px-3 py-1.5 rounded-full"
                  >
                    {chip.label}
                  </span>
                ))}
              </motion.div>
            </div>
          )}

          {!savedSession && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42, duration: 0.4 }}
              className="px-4 pb-6 max-w-2xl w-full mx-auto"
            >
              {/* Speech bubble — tail at bottom-left, aligned with input text start */}
              <div className="mb-3 ml-3">
                <div className="relative inline-block bg-[#CCFF00] text-black text-sm font-semibold px-4 py-2.5 rounded-2xl rounded-bl-none">
                  Escribí tu nombre para comenzar
                  <span className="absolute -bottom-1.5 left-0 w-3 h-3 bg-[#CCFF00] rounded-br-lg" />
                  <span className="absolute -bottom-3 left-0 w-3 h-3 bg-black rounded-br-lg" />
                </div>
              </div>

              <div className="flex gap-2 bg-zinc-900 border border-zinc-700/60 rounded-2xl p-2 focus-within:border-[#CCFF00]/40 transition-colors shadow-xl">
                <input
                  value={welcomeInput}
                  onChange={(e) => setWelcomeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleWelcomeSubmit() }}
                  placeholder="Tu nombre..."
                  autoFocus
                  className="flex-1 bg-transparent px-3 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none"
                />
                <button
                  onClick={handleWelcomeSubmit}
                  disabled={!welcomeInput.trim()}
                  className="w-10 h-10 rounded-xl bg-[#CCFF00] flex items-center justify-center hover:bg-[#b8e600] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                >
                  <Send className="w-4 h-4 text-black" />
                </button>
              </div>
              <p className="text-center text-zinc-700 text-xs mt-3">
                Sin registrarse · Sin tarjeta de crédito · Listo en segundos
              </p>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* ══ CHAT LAYOUT ══════════════════════════════════════════════════════ */}
      {stage !== "welcome" && (
        <motion.div
          key="chat"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="h-screen bg-black flex overflow-hidden"
        >
          {/* Sidebar Preview */}
          <div className="hidden lg:flex flex-col w-64 bg-[#1C1C28] m-4 rounded-[2.5rem] p-5 shadow-2xl shrink-0">
            <div className="flex items-center gap-3 px-2 mb-8 mt-2">
              <div className="w-10 h-10 rounded-xl bg-[#CCFF00] flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-black" />
              </div>
              <div>
                <p className="text-lg font-bold text-white leading-none">UcoBot</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                  CODEA DESARROLLOS
                </p>
              </div>
            </div>

            <nav className="flex-1 space-y-0.5 overflow-hidden">
              <AnimatePresence>
                {sidebarItems.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl text-zinc-400"
                  >
                    <span className="material-symbols-outlined text-xl text-zinc-500">
                      {item.materialIcon}
                    </span>
                    <span className="text-sm truncate">{item.label}</span>
                    {!item.isFixed && (
                      <Sparkles className="w-3 h-3 text-[#CCFF00]/50 ml-auto shrink-0" />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {sidebarItems.length === 0 && (
                <p className="px-4 py-3 text-zinc-700 text-sm">
                  Las secciones aparecerán aquí...
                </p>
              )}
            </nav>

            <AnimatePresence>
              {stage === "done" && configuredSessionId && (
                <motion.div
                  key="actions"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 pt-4 border-t border-white/10 shrink-0 space-y-2"
                >
                  <button
                    onClick={() => setTestSessionId(configuredSessionId)}
                    className="w-full flex items-center justify-center gap-2 bg-[#CCFF00] text-black text-sm font-bold py-2.5 rounded-xl hover:bg-[#b8e600] active:scale-95 transition-all"
                  >
                    <Bot className="w-4 h-4" />
                    Probar bot
                  </button>
                  <button
                    onClick={() => router.push("/register")}
                    className="w-full flex items-center justify-center gap-2 bg-white/5 text-white text-sm font-semibold py-2.5 rounded-xl border border-white/10 hover:bg-white/10 active:scale-95 transition-all"
                  >
                    <Sparkles className="w-4 h-4 text-[#CCFF00]" />
                    Activar cuenta
                  </button>
                </motion.div>
              )}
              {stage !== "done" && contactName && (
                <motion.div
                  key="greeting"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 pt-4 border-t border-white/10 shrink-0"
                >
                  <p className="text-white text-sm font-semibold">
                    Hola, {contactName.split(" ")[0]} 👋
                  </p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    {stage === "processing"
                      ? "Configurando tu bot..."
                      : "Recopilando información..."}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Chat Panel */}
          <div className="flex-1 flex flex-col min-h-0 lg:my-4 lg:mr-4 lg:rounded-[2.5rem] bg-zinc-950 overflow-hidden">
            <div className="bg-zinc-900/80 backdrop-blur-sm border-b border-white/5 px-4 py-3 flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-full bg-[#CCFF00] flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-black" />
              </div>
              <div className="flex-1 min-w-0">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={contactName || "default"}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-white text-sm font-semibold"
                  >
                    {contactName ? `Hola, ${contactName.split(" ")[0]} 👋` : "Asistente UcoBot"}
                  </motion.p>
                </AnimatePresence>
                <p className="text-zinc-500 text-xs">En línea · Configuración con IA</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex items-end gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  {msg.role === "bot" && (
                    <div className="w-7 h-7 rounded-full bg-[#CCFF00] flex items-center justify-center shrink-0 mb-0.5">
                      <Bot className="w-3.5 h-3.5 text-black" />
                    </div>
                  )}
                  {msg.type === "summary" && msg.summaryData ? (
                    <SummaryCard data={msg.summaryData} onGo={handleGoToDemo} />
                  ) : msg.type === "capabilities" && msg.capabilitiesData ? (
                    <CapabilitiesMessage data={msg.capabilitiesData} />
                  ) : (
                    <div
                      className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[#CCFF00] text-black font-medium rounded-br-sm whitespace-pre-line"
                          : "bg-zinc-800 text-zinc-100 rounded-bl-sm"
                      }`}
                    >
                      {msg.role === "user"
                        ? msg.content
                        : <FormattedMessage content={msg.content} />}
                    </div>
                  )}
                </motion.div>
              ))}

              <AnimatePresence>
                {isTyping && (
                  <motion.div
                    key="typing"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-end gap-2"
                  >
                    <div className="w-7 h-7 rounded-full bg-[#CCFF00] flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5 text-black" />
                    </div>
                    <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3">
                      <ThinkingIndicator />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showBuilding && (
                  <motion.div
                    key="building"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-end gap-2"
                  >
                    <div className="w-7 h-7 rounded-full bg-[#CCFF00] flex items-center justify-center shrink-0 mb-0.5">
                      <Bot className="w-3.5 h-3.5 text-black" />
                    </div>
                    <div className="bg-zinc-800 rounded-2xl rounded-bl-sm p-4 space-y-2.5 min-w-[240px] max-w-[320px]">
                      {BUILDING_STEPS.map((step, i) => {
                        const done = completedSteps.includes(i)
                        const current = buildingStepIndex === i && !done
                        const pending = i > buildingStepIndex
                        return (
                          <div
                            key={i}
                            className={`flex items-center gap-2.5 transition-opacity duration-300 ${
                              pending ? "opacity-25" : "opacity-100"
                            }`}
                          >
                            {done ? (
                              <CheckCircle2 className="w-4 h-4 text-[#CCFF00] shrink-0" />
                            ) : current ? (
                              <Loader2 className="w-4 h-4 text-[#CCFF00] animate-spin shrink-0" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-zinc-600 shrink-0" />
                            )}
                            <span
                              className={`text-sm ${
                                done
                                  ? "text-zinc-300"
                                  : current
                                  ? "text-white font-medium"
                                  : "text-zinc-600"
                              }`}
                            >
                              {step}
                            </span>
                          </div>
                        )
                      })}

                      {/* Reveal de la preconfiguración del bot */}
                      <AnimatePresence>
                        {revealName && (
                          <motion.div
                            key="reveal"
                            initial={{ opacity: 0, y: 8, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: "auto" }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="mt-1 pt-3 border-t border-white/10 space-y-2 overflow-hidden"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-[#CCFF00] flex items-center justify-center shrink-0">
                                <Bot className="w-4 h-4 text-black" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] text-zinc-500 uppercase tracking-wider leading-none">Nombre del bot</p>
                                <p className="text-white font-bold text-sm leading-tight mt-0.5 truncate">{revealName}</p>
                              </div>
                            </div>
                            {revealPrompt && (
                              <div className="bg-zinc-900/70 rounded-xl p-2.5 border border-white/5">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Sparkles className="w-3 h-3 text-[#CCFF00] shrink-0" />
                                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Personalidad asignada</p>
                                </div>
                                <p className="text-zinc-400 text-xs leading-relaxed line-clamp-3">{revealPrompt}</p>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-white/5 bg-zinc-900/80 backdrop-blur-sm p-3 flex gap-2 shrink-0">
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={inputPlaceholder}
                disabled={inputDisabled}
                autoFocus
                className="flex-1 bg-zinc-800 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#CCFF00]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="w-10 h-10 rounded-xl bg-[#CCFF00] flex items-center justify-center hover:bg-[#b8e600] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="w-4 h-4 text-black" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Inline bot test overlay — stays in the same screen, no navigation */}
    <AnimatePresence>
      {testSessionId && (
        <BotTestOverlay
          sessionId={testSessionId}
          onClose={() => { setTestSessionId(null); setShowPromptPanel(false) }}
          onActivate={() => router.push("/register")}
          onTogglePrompt={() => setShowPromptPanel((v) => !v)}
          promptPanelOpen={showPromptPanel}
        />
      )}
    </AnimatePresence>

    {/* Prompt panel — left of the bot test panel, live-updates when the assistant edits it */}
    <AnimatePresence>
      {testSessionId && showPromptPanel && (
        <PromptPanel
          sessionId={testSessionId}
          prompt={botPrompt}
          setPrompt={setBotPrompt}
          version={promptVersion}
          onClose={() => setShowPromptPanel(false)}
        />
      )}
    </AnimatePresence>
    </>
  )
}

// ── Inline bot test overlay ──────────────────────────────────────────────────
interface TestSession {
  bot_name: string
  business_name: string
  suggested_questions?: { title: string; description: string }[]
}

function BotTestOverlay({ sessionId, onClose, onActivate, onTogglePrompt, promptPanelOpen }: { sessionId: string; onClose: () => void; onActivate: () => void; onTogglePrompt: () => void; promptPanelOpen: boolean }) {
  const [session, setSession] = useState<TestSession | null>(null)
  const [msgs, setMsgs] = useState<{ role: "user" | "bot"; content: string }[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`/api/demo/chat?sessionId=${sessionId}`)
        const data = await res.json()
        if (active && res.ok) setSession(data.session)
      } catch {}
    })()
    return () => { active = false }
  }, [sessionId])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [msgs, loading])

  const send = async (text: string) => {
    if (!text.trim() || loading) return
    setMsgs((prev) => [...prev, { role: "user", content: text.trim() }])
    setInput("")
    setLoading(true)
    try {
      const res = await fetch("/api/demo/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text.trim() }),
      })
      const data = await res.json()
      setMsgs((prev) => [...prev, { role: "bot", content: data.response || "Disculpá, no pude responder. Probá de nuevo." }])
    } catch {
      setMsgs((prev) => [...prev, { role: "bot", content: "Hubo un error de conexión. Probá de nuevo." }])
    } finally {
      setLoading(false)
    }
  }

  const started = msgs.length > 0

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="fixed z-[61] inset-x-0 bottom-0 h-[80vh] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[400px] sm:h-[620px] sm:max-h-[80vh] bg-zinc-950 rounded-t-[1.75rem] sm:rounded-[1.75rem] border border-zinc-800 shadow-[0_24px_80px_rgba(0,0,0,0.65)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900/80 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#CCFF00] flex items-center justify-center flex-shrink-0"><Bot className="w-4 h-4 text-black" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">{session?.bot_name || "Tu bot"}</p>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#CCFF00] animate-pulse" />
              <span className="text-zinc-500 text-xs truncate">En línea · {session?.business_name || ""}</span>
            </div>
          </div>
          <button
            onClick={onTogglePrompt}
            title="Ver y editar el prompt del bot"
            className={`hidden sm:flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${
              promptPanelOpen
                ? "bg-[#CCFF00]/15 text-[#CCFF00] border-[#CCFF00]/40"
                : "bg-transparent text-zinc-400 border-zinc-700 hover:text-white hover:border-zinc-500"
            }`}
          >
            <Pencil className="w-3 h-3" />
            Prompt
          </button>
          <button onClick={onActivate} className="hidden sm:flex items-center gap-1 bg-[#CCFF00] text-black text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#b8e600] transition-colors flex-shrink-0">
            Activar cuenta <ArrowRight className="w-3 h-3" />
          </button>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-1 transition-colors flex-shrink-0"><X className="w-5 h-5" /></button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto demo-scroll p-4 space-y-3">
          {!started ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-5 px-2">
              <div className="w-16 h-16 rounded-3xl bg-[#CCFF00] flex items-center justify-center"><Bot className="w-8 h-8 text-black" /></div>
              <div>
                <p className="text-white text-lg font-bold">Probá a {session?.bot_name || "tu bot"}</p>
                <p className="text-zinc-500 text-sm mt-1">Escribile como lo haría un cliente real.</p>
              </div>
              {session?.suggested_questions && session.suggested_questions.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                  {session.suggested_questions.slice(0, 4).map((q, i) => (
                    <button key={i} onClick={() => send(q.title)}
                      className="bg-zinc-900 border border-zinc-800 hover:border-[#CCFF00]/40 rounded-xl p-3 text-left transition-colors">
                      <p className="text-white text-sm font-medium">{q.title}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">{q.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            msgs.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "bot" && <div className="w-7 h-7 rounded-lg bg-[#CCFF00] flex items-center justify-center flex-shrink-0 mt-0.5"><Bot className="w-3.5 h-3.5 text-black" /></div>}
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user" ? "bg-[#CCFF00] text-black rounded-br-sm font-medium whitespace-pre-wrap" : "bg-zinc-900 text-zinc-100 rounded-bl-sm border border-zinc-800"
                }`}>
                  {m.role === "user" ? m.content.replace(/\[HANDOVER\]/g, "").trim() : <FormattedMessage content={m.content} />}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex gap-2 justify-start">
              <div className="w-7 h-7 rounded-lg bg-[#CCFF00] flex items-center justify-center flex-shrink-0"><Bot className="w-3.5 h-3.5 text-black" /></div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
                {[0, 150, 300].map((d, i) => (<span key={i} className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-900/80 p-3 flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder="Escribí un mensaje..." autoFocus
            className="flex-1 bg-zinc-800 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#CCFF00]/40 transition-colors" />
          <button onClick={() => send(input)} disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-xl bg-[#CCFF00] flex items-center justify-center hover:bg-[#b8e600] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0">
            <Send className="w-4 h-4 text-black" />
          </button>
        </div>
      </motion.div>
    </>
  )
}

// ── Thinking indicator (spinner + frases rotativas) ────────────────────────────

const THINKING_PHRASES = [
  "Interpretando la solicitud...",
  "Analizando tu rubro...",
  "Repasando lo que UcoBot puede hacer...",
  "Pensando ideas para tu negocio...",
  "Armando la respuesta...",
]

function ThinkingIndicator() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % THINKING_PHRASES.length), 1800)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex items-center gap-2.5">
      <Loader2 className="w-4 h-4 text-[#CCFF00] animate-spin shrink-0" />
      <AnimatePresence mode="wait">
        <motion.span
          key={idx}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="text-sm text-zinc-400"
        >
          {THINKING_PHRASES[idx]}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}

// ── Capabilities message (tarjetitas de lo que UcoBot puede hacer) ─────────────

function CapabilitiesMessage({ data }: { data: CapabilitiesData }) {
  return (
    <div className="max-w-[92%] sm:max-w-[85%] space-y-2.5">
      {data.intro && (
        <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed text-zinc-100 w-fit">
          <FormattedMessage content={data.intro} />
        </div>
      )}

      <div className="bg-zinc-800/60 border border-zinc-700/40 rounded-2xl p-3">
        <div className="flex items-center gap-1.5 px-1 mb-2.5">
          <Sparkles className="w-3.5 h-3.5 text-[#CCFF00]" />
          <span className="text-[#CCFF00] text-[11px] font-semibold uppercase tracking-wider">
            Con UcoBot vas a poder
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.capabilities.map((cap, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.15 + i * 0.09, duration: 0.3, ease: "easeOut" }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-start gap-2.5 hover:border-[#CCFF00]/30 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-[#CCFF00]/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#CCFF00]" style={{ fontSize: 18 }}>
                  {cap.icon || "smart_toy"}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-[13px] font-semibold leading-tight">{cap.title}</p>
                {cap.description && (
                  <p className="text-zinc-500 text-xs mt-0.5 leading-snug">{cap.description}</p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {data.outro && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 + data.capabilities.length * 0.09 + 0.2 }}
          className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed text-zinc-100 w-fit"
        >
          <FormattedMessage content={data.outro} />
        </motion.div>
      )}
    </div>
  )
}

// ── Prompt panel (ver/editar el prompt del bot, con update en vivo) ────────────

function PromptPanel({ sessionId, prompt, setPrompt, version, onClose }: {
  sessionId: string
  prompt: string
  setPrompt: (p: string) => void
  version: number
  onClose: () => void
}) {
  const [draft, setDraft] = useState(prompt)
  const [loading, setLoading] = useState(!prompt)
  const [animating, setAnimating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const prevVersion = useRef(version)

  // Carga inicial si todavía no tenemos el prompt (ej: sesión retomada)
  useEffect(() => {
    if (prompt) { setDraft(prompt); setLoading(false); return }
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`/api/demo/chat?sessionId=${sessionId}`)
        const data = await res.json()
        const p = data.session?.personality_prompt || ""
        if (active) { setPrompt(p); setDraft(p) }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Efecto typewriter cuando el configurador actualiza el prompt en vivo
  useEffect(() => {
    if (version === prevVersion.current) return
    prevVersion.current = version
    const full = prompt
    if (!full) return
    setEditing(false)
    setAnimating(true)
    setDraft("")
    let i = 0
    const step = Math.max(3, Math.round(full.length / 140))
    const t = setInterval(() => {
      i += step
      setDraft(full.slice(0, i))
      if (viewRef.current) viewRef.current.scrollTop = viewRef.current.scrollHeight
      if (i >= full.length) {
        clearInterval(t)
        setDraft(full)
        setAnimating(false)
      }
    }, 16)
    return () => clearInterval(t)
  }, [version, prompt])

  const save = async () => {
    if (saving || animating || !draft.trim()) return
    setSaving(true)
    try {
      await fetch("/api/demo/configure", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, personality_prompt: draft }),
      })
      setPrompt(draft)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const dirty = draft !== prompt && !animating

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="fixed z-[62] inset-x-0 bottom-0 h-[80vh] sm:inset-x-auto sm:right-[445px] sm:bottom-5 sm:w-[400px] sm:h-[620px] sm:max-h-[80vh] bg-zinc-950 rounded-t-[1.75rem] sm:rounded-[1.75rem] border border-zinc-800 shadow-[0_24px_80px_rgba(0,0,0,0.65)] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900/80 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-[#CCFF00] flex items-center justify-center flex-shrink-0">
          <Pencil className="w-4 h-4 text-black" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold">Prompt del bot</p>
          <p className="text-zinc-500 text-xs truncate">
            {animating ? "El configurador lo está actualizando..." : "Editalo acá o pedíselo al configurador"}
          </p>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white p-1 transition-colors flex-shrink-0"><X className="w-5 h-5" /></button>
      </div>

      {/* Live update badge */}
      <AnimatePresence>
        {animating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 px-4 py-2 bg-[#CCFF00]/10 border-b border-[#CCFF00]/20 flex-shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#CCFF00] animate-pulse" />
            <span className="text-[#CCFF00] text-xs font-semibold">Reescribiendo el prompt en tiempo real...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      <div className="flex-1 p-3 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-[#CCFF00] animate-spin" />
          </div>
        ) : editing ? (
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            autoFocus
            className="w-full h-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-sm leading-relaxed resize-none focus:outline-none focus:border-[#CCFF00]/40 transition-colors text-zinc-200 demo-scroll"
          />
        ) : (
          <div
            ref={viewRef}
            className={`w-full h-full overflow-y-auto demo-scroll bg-zinc-900 border rounded-2xl p-4 transition-colors ${
              animating ? "border-[#CCFF00]/40" : "border-zinc-800"
            }`}
          >
            <FormattedMessage
              content={draft}
              className={`text-sm leading-relaxed space-y-0.5 [&_p.font-bold]:text-[#CCFF00] [&_p.font-semibold]:text-[#CCFF00] [&_p.font-bold]:mt-3 [&_strong]:text-white ${
                animating ? "text-[#d8ffb0]" : "text-zinc-300"
              }`}
            />
            {animating && <span className="inline-block w-1.5 h-4 bg-[#CCFF00] animate-pulse align-text-bottom ml-0.5" />}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-zinc-800 bg-zinc-900/80 flex-shrink-0">
        <p className="text-zinc-600 text-[10px] leading-tight">
          {editing
            ? (dirty ? "Tenés cambios sin guardar" : "Editando el prompt")
            : "El bot usa este prompt en cada respuesta"}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          {editing ? (
            <>
              <button
                onClick={() => { setDraft(prompt); setEditing(false) }}
                disabled={saving}
                className="text-zinc-400 hover:text-white text-xs font-semibold px-3 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors disabled:opacity-30"
              >
                Cancelar
              </button>
              <button
                onClick={async () => { await save(); setEditing(false) }}
                disabled={saving || !dirty}
                className="flex items-center gap-1.5 bg-[#CCFF00] text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-[#b8e600] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Guardar
              </button>
            </>
          ) : (
            <>
              {saved && (
                <span className="flex items-center gap-1 text-[#CCFF00] text-xs font-semibold">
                  <Check className="w-3.5 h-3.5" /> Guardado
                </span>
              )}
              <button
                onClick={() => setEditing(true)}
                disabled={animating}
                className="flex items-center gap-1.5 bg-[#CCFF00] text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-[#b8e600] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Summary Card ───────────────────────────────────────────────────────────────

const RENAMEABLE_SECTIONS = new Set(["orders", "reservations"])

interface SectionState extends AiSection {
  editing: boolean
}

function SummaryCard({
  data,
  onGo,
}: {
  data: SummaryData
  onGo: (sessionId: string, sections: ConfirmedSection[]) => void | Promise<void>
}) {
  const [sections, setSections] = useState<SectionState[]>(
    data.aiSections.map((s) => ({ ...s, editing: false }))
  )
  const [loading, setLoading] = useState(false)

  const toggle = (id: string) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)))

  const startEdit = (id: string) =>
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, editing: true } : { ...s, editing: false }))
    )

  const updateLabel = (id: string, label: string) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)))

  const stopEdit = (id: string) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, editing: false } : s)))

  const handleGo = async () => {
    if (loading) return
    setLoading(true)
    const confirmed: ConfirmedSection[] = sections
      .filter((s) => s.visible)
      .map((s) => ({ id: s.id, label: s.label, visible: true, icon: s.icon }))
    try {
      await onGo(data.sessionId, confirmed)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-80 bg-zinc-800 rounded-2xl rounded-bl-sm overflow-hidden border border-zinc-700/50"
    >
      {/* Header */}
      <div className="bg-[#CCFF00]/10 border-b border-[#CCFF00]/20 px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-3.5 h-3.5 text-[#CCFF00]" />
          <span className="text-[#CCFF00] text-xs font-semibold uppercase tracking-wide">
            Bot configurado con IA
          </span>
        </div>
        <p className="text-zinc-400 text-xs leading-relaxed">{data.businessSummary}</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Bot name */}
        <div>
          <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">
            Nombre del bot
          </p>
          <p className="text-white font-bold text-base">{data.botName}</p>
        </div>

        {/* Features */}
        {data.features.length > 0 && (
          <div>
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-2">
              Funcionalidades activadas
            </p>
            <div className="space-y-2.5">
              {data.features.map((f) => (
                <div key={f}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#CCFF00] shrink-0" />
                    <span className="text-zinc-200 text-sm font-medium">
                      {FEATURE_LABELS[f] || f}
                    </span>
                  </div>
                  {data.featureJustifications[f] && (
                    <p className="text-zinc-500 text-xs mt-0.5 pl-5 leading-relaxed">
                      {data.featureJustifications[f]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sections */}
        {sections.length > 0 && (
          <>
            <div className="border-t border-zinc-700/50" />
            <div>
              <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">
                Secciones de tu panel
              </p>
              <p className="text-zinc-600 text-[10px] mb-3">
                Marcá las que querés incluir · podés renombrar Pedidos y Reservas según tu rubro
              </p>
              <div className="space-y-3">
                {sections.map((section) => (
                  <div key={section.id} className="flex gap-2.5 items-start">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggle(section.id)}
                      className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                        section.visible
                          ? "bg-[#CCFF00] border-[#CCFF00]"
                          : "border-zinc-600 hover:border-zinc-400"
                      }`}
                    >
                      {section.visible && (
                        <Check className="w-3 h-3 text-black" strokeWidth={3} />
                      )}
                    </button>

                    {/* Name + justification */}
                    <div
                      className={`flex-1 min-w-0 transition-opacity ${
                        section.visible ? "opacity-100" : "opacity-35"
                      }`}
                    >
                      {section.editing ? (
                        <input
                          value={section.label}
                          onChange={(e) => updateLabel(section.id, e.target.value)}
                          onBlur={() => stopEdit(section.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") stopEdit(section.id)
                          }}
                          autoFocus
                          className="w-full bg-zinc-700 border border-[#CCFF00]/50 rounded px-2 py-0.5 text-white text-sm focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => section.visible && RENAMEABLE_SECTIONS.has(section.id) && startEdit(section.id)}
                          disabled={!section.visible || !RENAMEABLE_SECTIONS.has(section.id)}
                          className="flex items-center gap-1.5 group w-full text-left"
                        >
                          <span className="text-white text-sm font-medium">{section.label}</span>
                          {section.visible && RENAMEABLE_SECTIONS.has(section.id) && (
                            <Pencil className="w-3 h-3 text-zinc-600 group-hover:text-[#CCFF00] transition-colors shrink-0" />
                          )}
                        </button>
                      )}
                      {section.justification && (
                        <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">
                          {section.justification}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* CTA */}
        <button
          onClick={handleGo}
          disabled={loading}
          className="w-full bg-[#CCFF00] text-black font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-[#b8e600] active:scale-95 transition-all text-sm disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando...
            </>
          ) : (
            <>
              Probar mi bot ahora
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </motion.div>
  )
}
