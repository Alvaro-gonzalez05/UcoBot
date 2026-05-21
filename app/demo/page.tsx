"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Bot, Loader2, Sparkles, CheckCircle2, Send, Check, Pencil, ArrowRight } from "lucide-react"

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
  "Diseñando la personalidad del bot...",
  "Seleccionando funcionalidades ideales...",
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
}

// Lucide icon names — must match SIDEBAR_ICONS in [sessionId]/page.tsx
const LUCIDE_ICON_MAP: Record<string, string> = {
  clients:        "Users",
  orders:         "ShoppingBag",
  reservations:   "Calendar",
  promotions:     "Tag",
  forms:          "FileText",
  punto_de_venta: "Package",
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

interface ChatMessage {
  id: string
  role: "bot" | "user"
  content: string
  type?: "summary"
  summaryData?: SummaryData
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
  const [sidebarItems, setSidebarItems] = useState<SidebarPreviewItem[]>([])
  const [savedSession, setSavedSession] = useState<SavedDemoSession | null>(null)
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

  const handleSend = async () => {
    const text = inputValue.trim()
    if (!text || stageRef.current === "processing" || stageRef.current === "done") return
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
      try {
        const res = await fetch("/api/demo/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: "react_to_goals", contactName, businessName, userMessage: text }),
        })
        const data = await res.json()
        setIsTyping(false)
        appendBot(data.reply || "¡Perfecto! Contame más: ¿cuál es el mayor problema hoy en la atención al cliente y de dónde te llegan los clientes?")
      } catch {
        setIsTyping(false)
        appendBot("¡Perfecto! Para configurarlo bien: ¿cuál es el mayor problema hoy en la atención al cliente y de dónde te llegan los clientes?")
      }
    } else if (stageRef.current === "ask_followup") {
      followupTextRef.current = text
      setIsTyping(true)
      let replyMsg = "Perfecto, con todo esto ya puedo configurarlo bien 🎯\n\nVoy a analizar tu negocio y armar la configuración ahora mismo..."
      let needsTags = false
      try {
        const res = await fetch("/api/demo/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: "react_to_followup", contactName, businessName, userMessage: text }),
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
    }

    inputRef.current?.focus()
  }

  const runProcessing = async (name: string, biz: string, desc: string) => {
    setBuildingStepIndex(0)
    await delay(1100)
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
    await delay(1100)
    setCompletedSteps([0, 1])

    setBuildingStepIndex(2)
    await delay(1100)
    setCompletedSteps([0, 1, 2])

    setBuildingStepIndex(3)
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

    await delay(700)
    setCompletedSteps([0, 1, 2, 3])
    await delay(600)
    setShowBuilding(false)
    await delay(350)

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
    router.push(`/demo/${sessionId}`)
  }

  const inputDisabled = stage === "processing" || stage === "done"
  const canSend = inputValue.trim().length > 0 && !inputDisabled

  const inputPlaceholder =
    stage === "processing"
      ? "Analizando tu negocio..."
      : stage === "done"
      ? "¡Tu bot está listo! 🎉"
      : stage === "ask_business"
      ? "Nombre de tu negocio..."
      : stage === "ask_goals"
      ? "¿A qué se dedica el negocio y cómo atienden a sus clientes?"
      : stage === "ask_tags"
      ? "Ej: Lead Caliente / Frío, Inversor / Comprador Final..."
      : "Problemas actuales, canales de entrada, ¿tenés algo automatizado?"

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
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
                  onClick={() => router.push(`/demo/${savedSession.sessionId}`)}
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
              {contactName && (
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
                    {stage === "done"
                      ? "¡Tu bot está listo!"
                      : stage === "processing"
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
                  ) : (
                    <div
                      className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[#CCFF00] text-black font-medium rounded-br-sm"
                          : "bg-zinc-800 text-zinc-100 rounded-bl-sm whitespace-pre-line"
                      }`}
                    >
                      {msg.role === "user"
                        ? msg.content
                        : msg.content.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                            /^\*\*[^*]+\*\*$/.test(part) ? (
                              <strong key={i}>{part.slice(2, -2)}</strong>
                            ) : (
                              part
                            )
                          )}
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
                    <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
                      {[0, 150, 300].map((d, i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"
                          style={{ animationDelay: `${d}ms` }}
                        />
                      ))}
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
                    <div className="bg-zinc-800 rounded-2xl rounded-bl-sm p-4 space-y-2.5 min-w-[240px]">
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
  onGo: (sessionId: string, sections: ConfirmedSection[]) => void
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

  const handleGo = () => {
    if (loading) return
    setLoading(true)
    const confirmed: ConfirmedSection[] = sections
      .filter((s) => s.visible)
      .map((s) => ({ id: s.id, label: s.label, visible: true, icon: s.icon }))
    onGo(data.sessionId, confirmed)
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
