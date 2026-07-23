"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn, normalizeSearchText } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { ShoppingBag, Search, Plus, Minus, X, CreditCard, Banknote, Landmark, CheckCircle2, ReceiptText, Loader2, QrCode, Smartphone, Gift, Settings, UserPlus, UserRound, Star, Stamp, Printer, StickyNote, ChevronLeft } from "lucide-react"
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-methods"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { motion, AnimatePresence } from "framer-motion"
import QRCode from "react-qr-code"
import { toast } from "sonner"
import { useIntersectionObserver } from "@/hooks/use-intersection-observer"
import { LoyaltyScannerDialog } from "@/components/loyalty/loyalty-scanner-dialog"
import { broadcastLoyaltyUpdate } from "@/lib/loyalty-realtime"
import { PosSettingsDialog, DEFAULT_POS_SETTINGS, POS_SETTINGS_COLUMNS, type PosSettings } from "@/components/dashboard/pos-settings-dialog"
import { bestProductPromotion, promotionLabel, totalCapAdjustment, type Promotion } from "@/lib/promotions"
import { printTicket, type TicketData, type TicketWidth } from "@/lib/print-ticket"
import { PosOptionPickerDialog, type PosOptionGroup, type SelectedOption } from "./pos-option-picker-dialog"
import { CashSessionDialog, type CashSession } from "@/components/dashboard/cash-session-dialog"
import { Wallet } from "lucide-react"

interface Product {
  id: string
  name: string
  description?: string | null
  price: number
  category?: string | null
  is_available: boolean
  image_url?: string | null
  created_at: string
}

interface Client {
  id: string
  name: string
  phone?: string | null
  instagram_username?: string | null
  points?: number | null
  stamps?: number | null
  total_purchases?: number | null
  loyalty_code?: string | null
}

interface CartItem {
  /** Id único de la línea = producto + combinación de opciones (para no mezclar variantes) */
  lineId: string
  productId: string
  name: string
  price: number
  /** Precio original sin promoción (solo si tiene una promo aplicada) */
  originalPrice?: number
  /** Promo aplicada a este item (para mostrar y para contar usos al cerrar) */
  promoId?: string
  promoLabel?: string
  imageUrl?: string | null
  quantity: number
  /** Opciones elegidas (ej: Coca Zero); su precio ya está sumado en price */
  options?: SelectedOption[]
}

interface Reward {
  id: string
  name: string
  description?: string | null
  points_cost: number
  reward_type: string
  reward_value: string | null
  current_stock: number | null
}

/**
 * Interpreta reward_value como descuento monetario:
 * "10%" → 10% del subtotal · "500" o "$500" → monto fijo · texto sin número → 0
 * (los premios tipo producto/servicio/regalo se entregan en mano; el ticket
 * registra el canje pero sin descuento automático salvo que tengan valor numérico)
 */
function parseRewardDiscount(reward: Reward, subtotal: number): number {
  const raw = (reward.reward_value || "").trim()
  if (!raw) return 0
  const numMatch = raw.replace(",", ".").match(/\d+(\.\d+)?/)
  if (!numMatch) return 0
  const value = parseFloat(numMatch[0])
  if (!value || value <= 0) return 0
  const discount = raw.includes("%") ? subtotal * (value / 100) : value
  return Math.min(discount, subtotal)
}


interface LoyaltySettings {
  points_per_unit: number
  unit_amount: number
  is_active: boolean
  card_type: "points" | "stamps"
  stamps_required: number
  stamp_reward: string | null
}

interface PuntoDeVentaViewProps {
  userId: string
  products: Product[]
  categories: string[]
  clients: Client[]
  promotions: Promotion[]
  businessName?: string
  optionsByProduct?: Record<string, PosOptionGroup[]>
}

const PRODUCTS_PAGE_SIZE = 18

const paymentOptions = [
  { id: "cash", label: PAYMENT_METHOD_LABELS.cash, icon: Banknote },
  { id: "card", label: PAYMENT_METHOD_LABELS.card, icon: CreditCard },
  { id: "transfer", label: PAYMENT_METHOD_LABELS.transfer, icon: Landmark },
  { id: "qr", label: PAYMENT_METHOD_LABELS.qr, icon: QrCode },
  { id: "nave", label: PAYMENT_METHOD_LABELS.nave, icon: Smartphone },
]

/** Configs viejas usaban "link" (Link de pago); ahora es "qr". */
const normalizePaymentMethods = (methods: string[]) =>
  Array.from(new Set(methods.map((m) => (m === "link" ? "qr" : m))))

export function PuntoDeVentaView({ userId, products: initialProducts, categories: initialCategories, clients, promotions, businessName = "Mi Negocio", optionsByProduct = {} }: PuntoDeVentaViewProps) {
  const supabase = createClient()
  const [activeCategory, setActiveCategory] = useState("Todos")
  const [productSearch, setProductSearch] = useState("")
  // Catálogo completo en memoria: la búsqueda filtra acá (instantánea, sin ir al servidor)
  const [allProducts, setAllProducts] = useState<Product[]>(initialProducts)
  const [visibleCount, setVisibleCount] = useState(PRODUCTS_PAGE_SIZE)
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  // Feedback visual al agregar un producto (flash + "+N" sobre la tarjeta).
  // count acumula los toques seguidos: 1 toque → +1, 2 toques → +2, etc.
  const [justAdded, setJustAdded] = useState<{ id: string; count: number } | null>(null)
  const justAddedTimer = useRef<number | null>(null)
  const [clientSearch, setClientSearch] = useState("")
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  // Sin método por default: el pedido puede pasarse sin cobrar, o cobrarse eligiendo método
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null)
  // Animación de confirmación a panel completo: venta finalizada o pedido pasado
  const [saleSuccess, setSaleSuccess] = useState<null | "completed" | "pending">(null)
  // Ticket de la venta recién generada (para imprimirlo al toque) + fases de impresión
  const [lastTicket, setLastTicket] = useState<TicketData | null>(null)
  const [posPrintPhase, setPosPrintPhase] = useState<null | "printing" | "done">(null)
  // Producto para el que se está eligiendo opciones (modal centrado)
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null)
  const [mpQr, setMpQr] = useState<string | null>(null)
  const [mpQrLoading, setMpQrLoading] = useState(false)
  const [mpQrOrderId, setMpQrOrderId] = useState<string | null>(null)
  const [mpQrPaid, setMpQrPaid] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fidelización
  const [scannerOpen, setScannerOpen] = useState(false)
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null)
  const [redeemedReward, setRedeemedReward] = useState<Reward | null>(null)
  const [redeemStampGift, setRedeemStampGift] = useState(false)

  // Configuración del POS (medios de pago + propina) y cobro
  const [posSettings, setPosSettings] = useState<PosSettings>(DEFAULT_POS_SETTINGS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Caja del turno: las ventas se estampan con la sesión abierta (null = sin caja).
  // El POS no opera hasta que haya una caja abierta (gate de apertura).
  const [cashSession, setCashSession] = useState<CashSession | null>(null)
  const [cashSessionChecked, setCashSessionChecked] = useState(false)
  const [cashDialogOpen, setCashDialogOpen] = useState(false)
  // Sesión recién abierta: se muestra la animación "¡Caja abierta!" antes de entrar al POS
  const [justOpenedSession, setJustOpenedSession] = useState<CashSession | null>(null)
  // Propina: "auto" sigue el % sugerido de la config (se aplica sola), "off" sin propina,
  // "custom" un monto que cargó el cajero. El monto real se deriva más abajo.
  // Arranca en "off": la propina NO se suma sola. El cajero la agrega (botón % o
  // monto) solo si el cliente la dejó; si no, el total se guarda sin propina.
  const [tipMode, setTipMode] = useState<"auto" | "off" | "custom">("off")
  const [customTip, setCustomTip] = useState(0)
  const [amountPaid, setAmountPaid] = useState("")
  const [orderNote, setOrderNote] = useState("")
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false)
  // Cliente "sin registrar": nombre + mesa, sin guardarlo en la base
  const [walkin, setWalkin] = useState<{ name: string; table: string } | null>(null)
  const [clientMode, setClientMode] = useState<"list" | "walkin">("list")
  const [walkinNameInput, setWalkinNameInput] = useState("")
  const [walkinTableInput, setWalkinTableInput] = useState("")

  const isStampsMode = loyaltySettings?.card_type === "stamps"

  // Solo los medios de pago habilitados por el negocio
  const enabledPaymentOptions = paymentOptions.filter((o) => posSettings.payment_methods.includes(o.id))

  // En mobile, ocultar el downbar del dashboard mientras el carrito está abierto
  useEffect(() => {
    document.body.dataset.hideDownbar = isCartOpen ? "true" : "false"
    window.dispatchEvent(new Event("ucobot:downbar"))
    return () => {
      document.body.dataset.hideDownbar = "false"
      window.dispatchEvent(new Event("ucobot:downbar"))
    }
  }, [isCartOpen])

  useEffect(() => {
    // Cargar premios activos y la regla de puntos del negocio
    const loadLoyalty = async () => {
      const [{ data: rewardRows }, { data: settings }] = await Promise.all([
        supabase
          .from("rewards")
          .select("id, name, description, points_cost, reward_type, reward_value, current_stock")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("points_cost", { ascending: true }),
        supabase
          .from("loyalty_settings")
          .select("points_per_unit, unit_amount, is_active, card_type, stamps_required, stamp_reward")
          .eq("user_id", userId)
          .maybeSingle(),
      ])
      setRewards((rewardRows as Reward[]) || [])
      setLoyaltySettings(settings as LoyaltySettings | null)
    }
    loadLoyalty().catch((err) => console.error("Error loading loyalty data:", err))

    // Cargar configuración del POS (medios de pago + propina)
    supabase
      .from("pos_settings")
      .select(POS_SETTINGS_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          const pm = normalizePaymentMethods(
            Array.isArray(data.payment_methods) && data.payment_methods.length > 0
              ? data.payment_methods
              : ["cash", "card", "transfer", "qr"]
          )
          setPosSettings({
            payment_methods: pm,
            tip_enabled: data.tip_enabled ?? false,
            tip_percent: Number(data.tip_percent) || 10,
            ticket_width: Number(data.ticket_width) || 80,
            cash_auto_close_mode: data.cash_auto_close_mode || "off",
            cash_auto_close_hours: Number(data.cash_auto_close_hours) || 12,
            cash_auto_close_time: data.cash_auto_close_time || "23:59",
          })
          // No se auto-selecciona método: el usuario decide si cobra (y con qué) o pasa el pedido
        }
      })

    // Caja abierta del turno (si hay): las ventas se asocian a ella
    supabase
      .from("cash_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "open")
      .maybeSingle()
      .then(({ data }) => {
        setCashSession((data as CashSession) || null)
        setCashSessionChecked(true)
      })
  }, [userId])

  const handleCardScan = async (loyaltyCode: string) => {
    try {
      const { data: client, error } = await supabase
        .from("clients")
        .select("id, name, phone, instagram_username, points, stamps, total_purchases, loyalty_code")
        .eq("user_id", userId)
        .eq("loyalty_code", loyaltyCode)
        .maybeSingle()

      if (error || !client) {
        toast.error("Tarjeta no reconocida", {
          description: "El QR no corresponde a un cliente de este negocio.",
        })
        return
      }

      setSelectedClient(client)
      setRedeemedReward(null)
      setRedeemStampGift(false)
      setIsCartOpen(true)
      toast.success(`${client.name} identificado`, {
        description: isStampsMode
          ? `${client.stamps || 0}/${loyaltySettings?.stamps_required || 10} sellos`
          : `${client.points || 0} puntos disponibles`,
      })
    } catch {
      toast.error("Error al buscar la tarjeta")
    }
  }

  const { ref: loadMoreRef, isIntersecting } = useIntersectionObserver({
    threshold: 0.1,
    rootMargin: "200px",
    triggerOnce: false,
  })

  const categories = useMemo(() => {
    return ["Todos", ...initialCategories]
  }, [initialCategories])

  const filteredClients = useMemo(() => {
    const term = clientSearch.trim().toLowerCase()
    if (!term) {
      return []
    }

    return clients.filter((client) => {
      const instagram = client.instagram_username?.toLowerCase() || ""
      const phone = client.phone?.toLowerCase() || ""
      return client.name.toLowerCase().includes(term) || instagram.includes(term) || phone.includes(term)
    }).slice(0, 8)
  }, [clientSearch, clients])

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

  // Tope de descuento SOBRE EL TOTAL: si la suma de descuentos de una promo superó su tope,
  // se devuelve el excedente (el subtotal ya trae el % completo aplicado por ítem).
  const promoCapAdjustment = useMemo(() => totalCapAdjustment(cartItems, promotions), [cartItems, promotions])
  const subtotalAfterCaps = subtotal + promoCapAdjustment

  // Descuento por canje de premio (porcentaje o monto fijo, capado al subtotal)
  const rewardDiscount = useMemo(() => {
    if (!redeemedReward) return 0
    return parseRewardDiscount(redeemedReward, subtotalAfterCaps)
  }, [redeemedReward, subtotalAfterCaps])

  const discountedSubtotal = subtotalAfterCaps - rewardDiscount

  // Sugerencia de propina configurada por el negocio
  const suggestedTip = Math.round(discountedSubtotal * (posSettings.tip_percent / 100))
  // Monto real de propina (derivado): en "auto" sigue siempre al sugerido → nunca queda
  // desincronizado ni se "desactiva" solo al cambiar el carrito.
  const tip = !posSettings.tip_enabled
    ? 0
    : tipMode === "auto"
      ? suggestedTip
      : tipMode === "custom"
        ? customTip
        : 0

  const total = discountedSubtotal + tip
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  // Vuelto: lo que paga el cliente menos el total
  const paidNum = parseFloat(amountPaid.replace(",", ".")) || 0
  const change = paidNum > 0 ? paidNum - total : 0

  // Trae TODO el catálogo una sola vez: la búsqueda y las categorías filtran
  // en memoria (instantáneo, sin viajes al servidor por cada tecla).
  useEffect(() => {
    let cancelled = false
    const loadAll = async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, description, price, category, is_available, image_url, created_at")
        .eq("user_id", userId)
        .eq("is_available", true)
        .order("created_at", { ascending: false })
      if (!cancelled && !error && data) setAllProducts(data as Product[])
    }
    loadAll()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Filtrado client-side, tolerante a acentos. Con búsqueda activa se ignora
  // la categoría seleccionada (búsqueda global sobre todo el catálogo).
  const filteredProducts = useMemo(() => {
    const q = normalizeSearchText(productSearch.trim())
    if (q) {
      return allProducts.filter((p) =>
        normalizeSearchText(`${p.name} ${p.description ?? ""} ${p.category ?? ""}`).includes(q)
      )
    }
    if (activeCategory !== "Todos") return allProducts.filter((p) => p.category === activeCategory)
    return allProducts
  }, [allProducts, productSearch, activeCategory])

  const products = filteredProducts.slice(0, visibleCount)
  const hasMoreProducts = visibleCount < filteredProducts.length

  // Reset del paginado visual al cambiar búsqueda o categoría
  useEffect(() => {
    setVisibleCount(PRODUCTS_PAGE_SIZE)
  }, [productSearch, activeCategory])

  // Scroll infinito: solo agranda la ventana visible (sin red)
  useEffect(() => {
    if (isIntersecting && hasMoreProducts) {
      setVisibleCount((c) => c + PRODUCTS_PAGE_SIZE)
    }
  }, [isIntersecting, hasMoreProducts])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const getInitials = (value: string) => {
    return value
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase())
      .join("") || "CL"
  }

  const getClientHandle = (client: Client) => {
    if (client.phone) {
      return client.phone
    }

    if (client.instagram_username) {
      return client.instagram_username.startsWith("@")
        ? client.instagram_username
        : `@${client.instagram_username}`
    }

    return "Sin contacto"
  }

  // Flash de confirmación "+N" sobre la tarjeta del producto
  const flashAdd = (product: Product) => {
    setJustAdded((prev) =>
      prev && prev.id === product.id ? { id: product.id, count: prev.count + 1 } : { id: product.id, count: 1 }
    )
    if (justAddedTimer.current) window.clearTimeout(justAddedTimer.current)
    justAddedTimer.current = window.setTimeout(() => setJustAdded(null), 750)
  }

  // Firma de la línea: mismo producto con mismas opciones = misma línea (se acumula)
  const lineSignature = (productId: string, options: SelectedOption[]) =>
    productId + "|" + options.map((o) => `${o.group}:${o.name}`).sort().join("|")

  // Agrega una línea al carrito (con o sin opciones). El precio ya incluye los extras.
  const addLine = (product: Product, options: SelectedOption[], extra: number) => {
    // Mientras hay una venta confirmándose/confirmada, el carrito ya se guardó:
    // agregar acá mezclaría productos en ese pedido. Bloqueado hasta tocar "Listo".
    if (saleSuccess || isSubmitting) {
      toast.info("Terminá la venta actual primero", {
        description: "Tocá \"Listo\" para cerrar la venta y empezar un pedido nuevo.",
      })
      return
    }
    flashAdd(product)
    const promo = bestProductPromotion(
      { id: product.id, price: product.price, category: product.category },
      promotions
    )
    const basePrice = promo ? promo.price : product.price
    const unitPrice = Number((basePrice + extra).toFixed(2))
    const sig = lineSignature(product.id, options)
    setCartItems((prev) => {
      const existing = prev.find((item) => item.lineId === sig)
      if (existing) {
        return prev.map((item) => (item.lineId === sig ? { ...item, quantity: item.quantity + 1 } : item))
      }
      return [
        ...prev,
        {
          lineId: sig,
          productId: product.id,
          name: product.name,
          price: unitPrice,
          originalPrice: promo ? Number((product.price + extra).toFixed(2)) : undefined,
          promoId: promo ? promo.promo.id : undefined,
          promoLabel: promo ? promotionLabel(promo.promo) : undefined,
          imageUrl: product.image_url,
          quantity: 1,
          options: options.length ? options : undefined,
        },
      ]
    })
    if (typeof window !== "undefined" && window.innerWidth >= 1024) setIsCartOpen(true)
  }

  // Al tocar un producto: si tiene opciones, abre el modal; si no, se agrega directo
  const addProductToCart = (product: Product) => {
    // Venta en confirmación: no se puede empezar a cargar otro pedido todavía
    if (saleSuccess || isSubmitting) {
      toast.info("Terminá la venta actual primero", {
        description: "Tocá \"Listo\" para cerrar la venta y empezar un pedido nuevo.",
      })
      return
    }
    const groups = optionsByProduct[product.id]
    if (groups && groups.length > 0) {
      setPickerProduct(product)
      return
    }
    addLine(product, [], 0)
  }

  const updateQuantity = (lineId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) =>
          item.lineId === lineId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    )
  }

  const removeItem = (lineId: string) => {
    setCartItems((prev) => prev.filter((item) => item.lineId !== lineId))
  }

  const submitSale = async (status: "completed" | "pending") => {
    if (cartItems.length === 0) {
      toast.error("Agrega al menos un producto")
      return
    }

    if (redeemedReward && (!selectedClient || (selectedClient.points || 0) < redeemedReward.points_cost)) {
      toast.error("El cliente no tiene puntos suficientes para ese canje")
      return
    }
    if (redeemStampGift && (!selectedClient || (selectedClient.stamps || 0) < (loyaltySettings?.stamps_required || 10))) {
      toast.error("El cliente todavía no completó la tarjeta de sellos")
      return
    }

    setIsSubmitting(true)

    try {
      const paymentLabel = paymentMethod
        ? paymentOptions.find((option) => option.id === paymentMethod)?.label || paymentMethod
        : "Pago pendiente"

      const orderItems = cartItems.map((item) => ({
        product_id: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity,
        options: item.options && item.options.length ? item.options : undefined,
      })) as any[]

      if (redeemedReward && rewardDiscount > 0) {
        orderItems.push({
          product_id: null,
          name: `🎁 Canje: ${redeemedReward.name} (${redeemedReward.points_cost} pts)`,
          quantity: 1,
          price: -Number(rewardDiscount.toFixed(2)),
          subtotal: -Number(rewardDiscount.toFixed(2)),
        })
      }

      if (redeemStampGift && loyaltySettings) {
        orderItems.push({
          product_id: null,
          name: `🎁 Regalo por tarjeta completa: ${loyaltySettings.stamp_reward || "Regalo"}`,
          quantity: 1,
          price: 0,
          subtotal: 0,
        })
      }

      // La propina NO es un producto: es un cálculo sobre el total. En ventas cobradas
      // al toque se guarda en tip_amount; en pedidos que se PASAN (pendientes) no se
      // congela — se recalcula al cobrar en /pedidos según el % de la configuración.
      const orderTip = status === "completed" ? tip : 0
      const orderTotal = status === "completed" ? total : discountedSubtotal

      // Nota de cobro: medio de pago, canje, y vuelto si se ingresó
      const noteParts = [
        `Venta generada desde Punto de venta. ${status === "completed" && paymentMethod ? `Metodo de pago: ${paymentLabel}` : "Pago pendiente"}`,
      ]
      if (redeemedReward) noteParts.push(`Canje: ${redeemedReward.name}`)
      if (orderTip > 0) noteParts.push(`Propina/extra: ${formatCurrency(orderTip)}`)
      if (paidNum > 0) noteParts.push(`Pagó con ${formatCurrency(paidNum)} · Vuelto: ${formatCurrency(Math.max(0, change))}`)
      // Nota escrita por el cajero (se muestra en /pedidos; el resto es boilerplate que se limpia)
      if (orderNote.trim()) noteParts.push(orderNote.trim())

      const { data: createdOrder, error } = await supabase
        .from("orders")
        .insert({
          user_id: userId,
          client_id: selectedClient?.id || null,
          status: status,
          items: orderItems,
          total_amount: Number(orderTotal.toFixed(2)),
          tip_amount: Number(orderTip.toFixed(2)),
          payments: status === "completed" && paymentMethod ? [{ method: paymentMethod, amount: Number(orderTotal.toFixed(2)), label: paymentLabel }] : [],
          // Para walk-in guardamos "Nombre · Mesa X" en delivery_phone (se muestra como cliente)
          delivery_phone:
            selectedClient?.phone ||
            selectedClient?.instagram_username ||
            (walkin ? `${walkin.name}${walkin.table ? ` · Mesa ${walkin.table}` : ""}` : "venta-local"),
          customer_notes: noteParts.join(". "),
          source: "pos",
          cash_session_id: cashSession?.id ?? null,
        })
        .select("id")
        .single()

      if (error) {
        throw error
      }

      // Descuento de stock (insumos por receta + stock directo). No bloquea la venta si falla.
      if (createdOrder?.id) {
        supabase
          .rpc("apply_order_stock", { p_order_id: createdOrder.id, p_direction: -1 })
          .then(({ error: stockError }) => {
            if (stockError) console.error("Error applying order stock:", stockError)
          })
      }

      // Procesar fidelización (no bloquea la venta si falla)
      if (selectedClient && isStampsMode && loyaltySettings) {
        try {
          // Modo sellos:
          //  - Canje: consume la tarjeta completa y queda en 0 (no suma sello esa compra)
          //  - Compra normal: +1 sello si el programa está activo
          const required = loyaltySettings.stamps_required
          const currentStamps = selectedClient.stamps || 0
          let newStamps: number
          if (redeemStampGift) {
            newStamps = Math.max(0, currentStamps - required)
            await supabase.from("points_transactions").insert({
              user_id: userId,
              client_id: selectedClient.id,
              transaction_type: "redeemed",
              points_amount: 0,
              description: `Tarjeta de sellos completa: canje de "${loyaltySettings.stamp_reward || "regalo"}" (Punto de venta)`,
            })
          } else {
            newStamps = currentStamps + (loyaltySettings.is_active ? 1 : 0)
          }

          const newPurchases = (selectedClient.total_purchases || 0) + 1
          await supabase
            .from("clients")
            .update({
              stamps: newStamps,
              total_purchases: newPurchases,
              last_interaction_at: new Date().toISOString(),
            })
            .eq("id", selectedClient.id)

          // Realtime: la tarjeta del cliente se actualiza sola, con animación
          if (selectedClient.loyalty_code) {
            broadcastLoyaltyUpdate(supabase, selectedClient.loyalty_code, {
              stamps: newStamps,
              total_purchases: newPurchases,
            })
          }

          if (loyaltySettings.is_active) {
            toast.success(
              redeemStampGift
                ? `🎁 Regalo entregado. ${selectedClient.name} arranca de nuevo: ${newStamps}/${required} sellos`
                : newStamps >= required
                  ? `🎉 ¡${selectedClient.name} completó la tarjeta! Tiene un regalo pendiente`
                  : `+1 sello para ${selectedClient.name} (${newStamps}/${required})`
            )
          }
        } catch (loyaltyError) {
          console.error("Error processing stamps:", loyaltyError)
          toast.warning("La venta se registró, pero hubo un error actualizando los sellos")
        }
      } else if (selectedClient) {
        try {
          let pointsDelta = 0
          const txInserts: any[] = []

          if (redeemedReward) {
            pointsDelta -= redeemedReward.points_cost
            txInserts.push({
              user_id: userId,
              client_id: selectedClient.id,
              transaction_type: "redeemed",
              points_amount: -redeemedReward.points_cost,
              description: `Canje: ${redeemedReward.name} (Punto de venta)`,
            })
            // Descontar stock del premio si está limitado
            if (redeemedReward.current_stock !== null) {
              await supabase
                .from("rewards")
                .update({ current_stock: Math.max(0, redeemedReward.current_stock - 1) })
                .eq("id", redeemedReward.id)
            }
          }

          if (loyaltySettings?.is_active && loyaltySettings.points_per_unit > 0 && discountedSubtotal > 0) {
            const earned = Math.floor(discountedSubtotal / Number(loyaltySettings.unit_amount)) * loyaltySettings.points_per_unit
            if (earned > 0) {
              pointsDelta += earned
              txInserts.push({
                user_id: userId,
                client_id: selectedClient.id,
                transaction_type: "earned",
                points_amount: earned,
                description: `Compra en Punto de venta (${formatCurrency(discountedSubtotal)})`,
              })
            }
          }

          if (txInserts.length > 0) {
            await supabase.from("points_transactions").insert(txInserts)
            const newPoints = Math.max(0, (selectedClient.points || 0) + pointsDelta)
            const newPurchases = (selectedClient.total_purchases || 0) + 1
            await supabase
              .from("clients")
              .update({
                points: newPoints,
                total_purchases: newPurchases,
                last_interaction_at: new Date().toISOString(),
              })
              .eq("id", selectedClient.id)

            // Realtime: la tarjeta del cliente se actualiza sola, con animación
            if (selectedClient.loyalty_code) {
              broadcastLoyaltyUpdate(supabase, selectedClient.loyalty_code, {
                points: newPoints,
                total_purchases: newPurchases,
              })
            }

            if (pointsDelta !== 0) {
              toast.success(
                pointsDelta > 0
                  ? `+${pointsDelta} puntos para ${selectedClient.name} (total: ${newPoints})`
                  : `Canje aplicado. Saldo de ${selectedClient.name}: ${newPoints} puntos`
              )
            }
          }
        } catch (loyaltyError) {
          console.error("Error processing loyalty points:", loyaltyError)
          toast.warning("La venta se registró, pero hubo un error actualizando los puntos")
        }
      }

      // Sin toast: la animación de confirmación del panel ya avisa el resultado

      // Contabilizar un uso por cada promoción aplicada en esta venta (respeta el límite en DB)
      const usedPromoIds = Array.from(
        new Set(cartItems.map((i) => i.promoId).filter((id): id is string => !!id))
      )
      for (const pid of usedPromoIds) {
        try {
          await supabase.rpc("increment_promotion_use", { p_id: pid })
        } catch (e) {
          console.error("Error incrementing promotion use:", e)
        }
      }

      // La limpieza del carrito ocurre en resetSale() (al tocar "Listo" en la confirmación)
      return createdOrder?.id as string | null
    } catch (error) {
      console.error("Error creating POS order:", error)
      toast.error("No se pudo procesar el pedido")
      return null
    } finally {
      setIsSubmitting(false)
    }
  }

  // Limpia el carrito y cierra el panel (después de la confirmación / impresión)
  const resetSale = () => {
    setCartItems([])
    setSelectedClient(null)
    setWalkin(null)
    setClientMode("list")
    setClientSearch("")
    setPaymentMethod(null)
    setRedeemedReward(null)
    setRedeemStampGift(false)
    setTipMode("off")
    setCustomTip(0)
    setAmountPaid("")
    setOrderNote("")
    setSaleSuccess(null)
    setPosPrintPhase(null)
    setLastTicket(null)
    setIsCartOpen(false)
  }

  // Snapshot del ticket ANTES de limpiar el carrito (mismo formato que /pedidos)
  const buildPosTicket = (status: "completed" | "pending", orderId: string): TicketData => {
    const items = cartItems.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      options: i.options?.map((o) => o.name),
    }))
    if (rewardDiscount > 0 && redeemedReward) {
      items.push({ name: `Canje: ${redeemedReward.name}`, quantity: 1, price: -rewardDiscount, options: undefined })
    }
    // Si la propina activa coincide con la sugerida, la línea dice "Propina sugerida X%"
    const isSuggested = posSettings.tip_enabled && tip > 0 && tip === suggestedTip
    return {
      businessName,
      orderId,
      clientName: selectedClient?.name || (walkin ? `${walkin.name}${walkin.table ? ` · Mesa ${walkin.table}` : ""}` : undefined),
      orderType: "Punto de venta",
      items,
      total, // ya incluye propina y descuentos
      tipAmount: tip > 0 ? tip : undefined,
      tipLabel: isSuggested ? `Propina sugerida ${posSettings.tip_percent}%` : "Propina / extra",
      // No incluimos el método de pago en el ticket: repetía el total innecesariamente
      payments: undefined,
      notes: [orderNote.trim(), status === "pending" ? "Pago pendiente" : ""].filter(Boolean).join(". ") || undefined,
    }
  }

  // Imprime el ticket recién generado, con la animación imprimiendo → impreso
  const handlePosPrint = () => {
    if (!lastTicket) return
    setPosPrintPhase("printing")
    printTicket(lastTicket, (posSettings.ticket_width as TicketWidth) || 80)
    window.setTimeout(() => setPosPrintPhase("done"), 1500)
  }

  // Cobra la venta: exige método elegido, muestra la animación y después confirma.
  // El panel queda con los botones "Imprimir ticket" / "Listo" hasta que el usuario cierre.
  const finalizeSale = () => {
    if (!paymentMethod) {
      toast.error("Elegí un método de pago", { description: "O usá \"Pasar pedido\" para cobrarlo después." })
      return
    }
    setSaleSuccess("completed")
    window.setTimeout(async () => {
      const orderId = await submitSale("completed")
      if (!orderId) {
        setSaleSuccess(null)
        return
      }
      setLastTicket(buildPosTicket("completed", orderId))
    }, 1400)
  }

  // Genera un QR INTEROPERABLE (lo paga cualquier billetera) por el total del carrito.
  const generateMpQr = async () => {
    if (total <= 0) {
      toast.error("El carrito está vacío")
      return
    }
    setMpQrLoading(true)
    setMpQrPaid(false)
    setMpQrOrderId(null)
    try {
      const res = await fetch("/api/mp/create-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(total.toFixed(2)) }),
      })
      const j = await res.json()
      if (!res.ok || !j.qr_data) {
        toast.error(j.error || "No se pudo generar el QR")
        return
      }
      setMpQr(j.qr_data)
      setMpQrOrderId(j.order_id || null)
    } catch {
      toast.error("Error de red al generar el QR")
    } finally {
      setMpQrLoading(false)
    }
  }

  // Polling: mientras el QR está abierto y no se pagó, consultamos el estado.
  useEffect(() => {
    if (!mpQr || !mpQrOrderId || mpQrPaid) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/mp/qr-status?orderId=${mpQrOrderId}`)
        const j = await res.json()
        if (j.paid) {
          setMpQrPaid(true)
          toast.success("¡Pago recibido!")
          clearInterval(interval)
        }
      } catch {
        /* reintenta en el próximo tick */
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [mpQr, mpQrOrderId, mpQrPaid])

  // Al confirmarse el pago QR: registra la orden, cierra el diálogo del QR y pasa
  // al panel de confirmación con los botones de imprimir/cerrar.
  useEffect(() => {
    if (!mpQrPaid) return
    const t = setTimeout(async () => {
      const orderId = await submitSale("completed")
      setMpQr(null)
      setMpQrOrderId(null)
      setMpQrPaid(false)
      if (orderId) {
        setSaleSuccess("completed")
        setLastTicket(buildPosTicket("completed", orderId))
      }
    }, 1800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpQrPaid])

  // Pasa el pedido sin cobrar (queda pendiente en Pedidos), con su propia animación
  const moveOrder = () => {
    setSaleSuccess("pending")
    window.setTimeout(async () => {
      const orderId = await submitSale("pending")
      if (!orderId) {
        setSaleSuccess(null)
        return
      }
      setLastTicket(buildPosTicket("pending", orderId))
    }, 1400)
  }

  // Gate de caja: hasta que no haya una caja abierta, el POS no muestra productos
  // ni permite vender. Pantalla de apertura de turno en su lugar.
  if (!cashSessionChecked) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!cashSession) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-4 pb-24 lg:pb-4">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white dark:bg-muted p-8 text-center shadow-[0_24px_48px_-16px_rgba(17,24,39,0.4)] dark:shadow-[0_24px_48px_-16px_rgba(0,0,0,0.9)]"
        >
          <AnimatePresence mode="wait">
            {justOpenedSession ? (
              // Animación de apertura: círculo verde + mensaje, y después entra el POS
              <motion.div
                key="opened"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <motion.div
                  initial={{ scale: 0.4, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 15 }}
                  className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500"
                >
                  <CheckCircle2 className="h-10 w-10 text-white" />
                </motion.div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-foreground">¡Caja abierta!</h2>
                <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
                  Turno a nombre de <span className="font-semibold">{justOpenedSession.opened_by}</span>. ¡Buenas ventas!
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="closed"
                initial={false}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#1f2030]">
                  <Wallet className="h-9 w-9 text-[#d8ff55]" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-foreground">La caja está cerrada</h2>
                <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
                  Para empezar a vender abrí la caja del turno: quedan registradas todas las ventas a nombre del responsable.
                </p>
                <button
                  type="button"
                  onClick={() => setCashDialogOpen(true)}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1f2030] px-8 py-4 text-base font-bold text-[#d8ff55] shadow-[0_10px_24px_-8px_rgba(17,24,39,0.6)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Wallet className="h-5 w-5" />
                  Abrir caja
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <CashSessionDialog
          open={cashDialogOpen}
          onOpenChange={setCashDialogOpen}
          userId={userId}
          businessName={businessName}
          ticketWidth={(posSettings.ticket_width as TicketWidth) || 80}
          activeSession={cashSession}
          onSessionChange={(session) => {
            if (session) {
              // Mostrar la animación de apertura y recién después entrar al POS
              setJustOpenedSession(session)
              window.setTimeout(() => {
                setCashSession(session)
                setJustOpenedSession(null)
              }, 1400)
            } else {
              setCashSession(null)
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-background p-3 pb-24 sm:p-4 sm:pb-24 lg:p-4 lg:pb-4 xl:p-6 overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1500px] gap-4 rounded-[2rem] bg-transparent">
        <section
          className={cn(
            "flex min-w-0 flex-1 flex-col transition-all duration-500",
            isCartOpen ? "lg:mr-0" : ""
          )}
        >
          <div className="mb-4 flex flex-shrink-0 items-center gap-3 rounded-[1.6rem] bg-white dark:bg-muted px-4 py-3 shadow-[0_14px_28px_-12px_rgba(17,24,39,0.5)] dark:shadow-[0_14px_28px_-12px_rgba(0,0,0,0.9)]">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <Input
              value={productSearch}
              onChange={(event) => {
                setProductSearch(event.target.value)
                // La búsqueda es global: al escribir volvemos a "Todos" para que la UI coincida
                if (event.target.value.trim() && activeCategory !== "Todos") setActiveCategory("Todos")
              }}
              placeholder="Buscar productos por nombre, descripcion o categoria..."
              className="h-auto border-0 bg-transparent p-0 text-sm text-slate-700 shadow-none placeholder:text-slate-400 focus-visible:ring-0"
            />

            {/* Accesos rápidos: caja del turno y configuración del punto de venta */}
            <div className="flex shrink-0 items-center gap-1.5 border-l border-border/60 pl-2">
              <button
                type="button"
                onClick={() => setCashDialogOpen(true)}
                title={`Caja abierta por ${cashSession.opened_by} · tocá para cerrarla`}
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-muted dark:text-muted-foreground"
              >
                <Wallet className="h-[18px] w-[18px]" />
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-muted" />
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                title="Configuración del punto de venta"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-muted dark:text-muted-foreground"
              >
                <Settings className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>

          <div className="mb-2 -mx-4 flex flex-shrink-0 gap-2 overflow-x-auto px-4 py-3.5 hide-scrollbar-mobile">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={cn(
                  "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors shadow-[0_4px_12px_-3px_rgba(17,24,39,0.4)] dark:shadow-[0_4px_12px_-3px_rgba(0,0,0,0.7)]",
                  activeCategory === category
                    ? "bg-[#1f2030] text-[#d8ff55]"
                    : "bg-white dark:bg-muted text-slate-400 hover:text-slate-700 dark:hover:text-foreground"
                )}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto -mx-4 px-4 pt-2 pb-8 custom-scrollbar hide-scrollbar-mobile">
          {products.length === 0 ? (
            <div className="flex h-[420px] items-center justify-center rounded-[2rem] border border-dashed border-slate-200 dark:border-border bg-white dark:bg-card text-center text-slate-500 dark:text-muted-foreground">
              <div className="max-w-sm px-6">
                {productSearch.trim() ? (
                  <>
                    <p className="text-lg font-semibold text-slate-700 dark:text-foreground">Sin resultados para &quot;{productSearch.trim()}&quot;</p>
                    <p className="mt-2 text-sm text-slate-500 dark:text-muted-foreground">Probá con otro nombre, descripción o categoría.</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold text-slate-700 dark:text-foreground">No hay productos disponibles</p>
                    <p className="mt-2 text-sm text-slate-500 dark:text-muted-foreground">Carga productos en tu catalogo para empezar a vender desde esta seccion.</p>
                  </>
                )}
                  </div>
                </div>
              ) : (
                <>
              <div
                className={cn(
                  "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]",
                  // Venta confirmándose: la grilla queda atenuada hasta tocar "Listo"
                  (saleSuccess || isSubmitting) && "pointer-events-none opacity-40 transition-opacity"
                )}
              >
                {products.map((product) => {
                  const promo = bestProductPromotion(
                    { id: product.id, price: product.price, category: product.category },
                    promotions
                  )
                  return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProductToCart(product)}
                    className={cn(
                      "group relative rounded-[2rem] bg-white dark:bg-card p-3 text-left border border-muted shadow-[0_16px_30px_-12px_rgba(17,24,39,0.5)] dark:shadow-[0_16px_30px_-12px_rgba(0,0,0,0.9)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_24px_40px_-14px_rgba(17,24,39,0.6)] dark:hover:shadow-[0_24px_40px_-14px_rgba(0,0,0,1)] active:scale-95",
                      justAdded?.id === product.id && "ring-2 ring-[#D1F366] scale-[0.97]"
                    )}
                  >
                    {/* Media: imagen o placeholder con la inicial. El badge va acá (nunca tapa el nombre) */}
                    <div className="relative mb-3 overflow-hidden rounded-[1.5rem] bg-[#eef0f3] dark:bg-muted">
                      {/* "+N" al agregar: centrado sobre la imagen (su overflow-hidden evita cualquier corte externo) */}
                      <AnimatePresence>
                        {justAdded?.id === product.id && (
                          <motion.div
                            key={justAdded.count}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#1C1C28]/25"
                          >
                            <motion.span
                              initial={{ scale: 0.4, y: 10 }}
                              animate={{ scale: 1.15, y: 0 }}
                              exit={{ scale: 0.8, y: -12, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 380, damping: 18 }}
                              className="rounded-full bg-[#D1F366] px-3.5 py-1.5 text-base font-black text-[#1C1C28] shadow-xl"
                            >
                              +{justAdded.count}
                            </motion.span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div className="aspect-square overflow-hidden rounded-[1.5rem]">
                        {product.image_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={product.image_url}
                            alt={product.name}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#eef1f5] to-[#e1e5ea] dark:from-muted dark:to-card">
                            <span className="select-none text-4xl font-black text-slate-300 dark:text-muted-foreground/40">
                              {product.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      {promo && (
                        <span className="absolute left-2 top-2 rounded-full bg-[#D1F366] px-2.5 py-1 text-[10px] font-extrabold text-[#1C1C28] shadow-md">
                          {promotionLabel(promo.promo)}
                        </span>
                      )}
                    </div>

                    {/* Nombre + precio */}
                    <div className="min-w-0 space-y-1.5 px-1">
                      {product.category && (
                        <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-muted-foreground">
                          {product.category}
                        </span>
                      )}
                      <h3 className="line-clamp-2 min-h-[2.5rem] text-[15px] font-semibold leading-tight text-slate-900 dark:text-foreground">
                        {product.name}
                      </h3>
                      <div className="flex items-end justify-between gap-2 pt-0.5">
                        <div className="min-w-0 flex-1">
                          {promo && (
                            <span className="block text-xs leading-none text-slate-400 line-through">
                              {formatCurrency(product.price)}
                            </span>
                          )}
                          <span className={cn(
                            "block truncate text-lg font-black leading-tight tracking-tight sm:text-xl",
                            promo ? "text-[#5c7a16] dark:text-[#D1F366]" : "text-slate-900 dark:text-foreground"
                          )}>
                            {formatCurrency(promo ? promo.price : product.price)}
                          </span>
                        </div>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f0f2f5] dark:bg-muted text-slate-600 dark:text-muted-foreground transition-colors group-hover:bg-[#D1F366] group-hover:text-[#1C1C28]">
                          <Plus className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </button>
                  )
                })}
              </div>

              <div ref={loadMoreRef} className="flex justify-center py-6">
                {hasMoreProducts ? (
                  <div className="h-5" />
                ) : products.length > 0 ? (
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">No hay mas productos</p>
                ) : null}
              </div>
            </>
          )}
          </div>
        </section>

        <aside
          className={cn(
            "fixed inset-y-0 right-0 z-40 w-full max-w-[440px] transform bg-white dark:bg-card shadow-2xl transition-transform duration-500 ease-out lg:static lg:h-full lg:w-[420px] lg:shrink-0 lg:rounded-[2rem] lg:shadow-none",
            isCartOpen ? "translate-x-0" : "translate-x-full lg:w-0 lg:max-w-0 lg:opacity-0"
          )}
        >
          <div className={cn("flex h-full w-full flex-col overflow-hidden bg-white dark:bg-card lg:rounded-[2rem]", !isCartOpen && "lg:hidden")}>
            {/* Header — fijo arriba: título + cliente (círculo) + ajustes + cerrar */}
            <div className="flex-shrink-0 flex items-center justify-between gap-2 p-3 sm:p-4 pb-2 text-left">
              <p className="text-sm font-bold dark:text-white">Carrito</p>
              <div className="flex items-center gap-2">
                <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                  <PopoverTrigger asChild>
                    {selectedClient || walkin ? (
                      <button
                        type="button"
                        onMouseEnter={() => setClientPopoverOpen(true)}
                        title={selectedClient?.name || walkin?.name}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f2030] text-[11px] font-black text-[#d8ff55] ring-2 ring-[#d8ff55] transition-transform hover:scale-105"
                      >
                        {getInitials(selectedClient?.name || walkin?.name || "?")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Asignar cliente"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d8ff55] text-[#1C1C28] shadow-md transition-transform hover:scale-105"
                      >
                        <UserRound className="h-4 w-4" />
                      </button>
                    )}
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-72 p-0 overflow-hidden"
                    onMouseLeave={() => { if (selectedClient) setClientPopoverOpen(false) }}
                  >
                    {selectedClient || walkin ? (
                      <div className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#1f2030] text-sm font-black text-[#d8ff55]">
                            {getInitials(selectedClient?.name || walkin?.name || "?")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold">{selectedClient?.name || walkin?.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {selectedClient ? getClientHandle(selectedClient) : walkin?.table ? `Mesa ${walkin.table}` : "Sin registrar"}
                            </p>
                          </div>
                        </div>
                        {selectedClient && (
                          <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/50 p-2.5 text-sm">
                            {isStampsMode ? (
                              <>
                                <Stamp className="h-4 w-4 text-[#1C1C28] dark:text-[#D1F366]" />
                                <span className="font-bold">{selectedClient.stamps || 0}/{loyaltySettings?.stamps_required || 10}</span>
                                <span className="text-muted-foreground">visitas</span>
                              </>
                            ) : (
                              <>
                                <Star className="h-4 w-4 text-amber-500" />
                                <span className="font-bold">{(selectedClient.points || 0).toLocaleString("es-AR")}</span>
                                <span className="text-muted-foreground">puntos</span>
                              </>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => { setSelectedClient(null); setWalkin(null); setRedeemedReward(null); setRedeemStampGift(false); setClientPopoverOpen(false) }}
                          className="mt-3 w-full rounded-xl border border-border py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
                        >
                          Quitar cliente
                        </button>
                      </div>
                    ) : clientMode === "walkin" ? (
                      <div className="space-y-3 p-3">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setClientMode("list")} className="rounded-lg p-1 hover:bg-muted">
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <span className="text-sm font-bold">Cliente sin registrar</span>
                        </div>
                        <Input value={walkinNameInput} onChange={(e) => setWalkinNameInput(e.target.value)} placeholder="Nombre (ej: Juan)" className="h-9" autoFocus />
                        <Input value={walkinTableInput} onChange={(e) => setWalkinTableInput(e.target.value)} placeholder="Mesa (opcional)" className="h-9" />
                        <button
                          type="button"
                          disabled={!walkinNameInput.trim()}
                          onClick={() => {
                            setWalkin({ name: walkinNameInput.trim(), table: walkinTableInput.trim() })
                            setWalkinNameInput(""); setWalkinTableInput(""); setClientMode("list"); setClientPopoverOpen(false)
                          }}
                          className="w-full rounded-xl bg-[#d8ff55] py-2 text-xs font-bold text-[#1C1C28] transition-colors hover:bg-[#c8ef42] disabled:opacity-50"
                        >
                          Usar cliente
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 p-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                            placeholder="Buscar cliente..."
                            className="h-9 pl-9"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-52 space-y-1 overflow-y-auto">
                          {filteredClients.length > 0 ? (
                            filteredClients.map((client) => (
                              <button
                                key={client.id}
                                type="button"
                                onClick={() => { setSelectedClient(client); setClientSearch(""); setClientPopoverOpen(false) }}
                                className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-muted"
                              >
                                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                                  {getInitials(client.name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{client.name}</p>
                                  <p className="truncate text-xs text-muted-foreground">{getClientHandle(client)}</p>
                                </div>
                              </button>
                            ))
                          ) : clientSearch.trim() ? (
                            <p className="py-3 text-center text-xs text-muted-foreground">Sin resultados.</p>
                          ) : (
                            <p className="py-3 text-center text-xs text-muted-foreground">Escribí para buscar un cliente.</p>
                          )}
                        </div>
                        {/* Cliente rápido sin guardarlo en la base (mesa incluida) */}
                        <button
                          type="button"
                          onClick={() => { setWalkinNameInput(clientSearch.trim()); setClientMode("walkin") }}
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                        >
                          <UserRound className="h-3.5 w-3.5" /> Cliente sin registrar (nombre + mesa)
                        </button>
                        <div className="flex items-center gap-2 border-t border-border pt-3">
                          <button
                            type="button"
                            onClick={() => { setClientPopoverOpen(false); setScannerOpen(true) }}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#1f2030] py-2 text-xs font-semibold text-[#d8ff55] transition-colors hover:bg-[#1f2030]/90"
                          >
                            <QrCode className="h-3.5 w-3.5" />
                            Escanear
                          </button>
                          <Link
                            href="/dashboard/clientes"
                            className="flex-1 rounded-xl border border-border py-2 text-center text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
                          >
                            Crear nuevo
                          </Link>
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>

                <button
                  type="button"
                  onClick={() => setCashDialogOpen(true)}
                  title={cashSession ? `Caja abierta · ${cashSession.opened_by}` : "Caja cerrada · tocá para abrir"}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70"
                >
                  <Wallet className="h-4 w-4" />
                  <span
                    className={cn(
                      "absolute right-0.5 top-0.5 h-2 w-2 rounded-full",
                      cashSession ? "bg-emerald-500" : "bg-red-500"
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  title="Configuración del punto de venta"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsCartOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 lg:hidden"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Carrito + fidelización — única zona scrolleable */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-3 sm:px-4 pt-1 pb-1 space-y-3 text-left">
                <div className="w-full rounded-[1.5rem] border border-slate-100 bg-[#f8f8fb] dark:bg-muted/30 p-3.5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Carrito actual</p>
                    </div>
                    <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">{totalItems} productos</p>
                  </div>

                  {cartItems.length === 0 ? (
                    <div className="rounded-[1.25rem] border border-dashed border-slate-200 dark:border-border bg-white dark:bg-card p-6 text-center text-sm text-slate-500 dark:text-muted-foreground">
                      Toca cualquier producto para empezar a armar el pedido.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cartItems.map((item) => (
                        <div key={item.lineId} className="flex min-w-0 flex-row items-center gap-3 rounded-[1.25rem] bg-white dark:bg-card p-3 shadow-sm dark:shadow-none">
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[1rem] bg-slate-100 dark:bg-muted">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-slate-400">
                                <ShoppingBag className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-semibold leading-tight text-slate-800 dark:text-foreground line-clamp-3 break-words">{item.name}</h4>
                            {item.options && item.options.length > 0 && (
                              <p className="mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-muted-foreground">
                                {item.options.map((o) => o.name + (o.delta > 0 ? ` (+${formatCurrency(o.delta)})` : "")).join(" · ")}
                              </p>
                            )}
                            <p className="truncate text-xs text-slate-400 mt-1">{formatCurrency(item.price)} / ud</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <button type="button" onClick={() => updateQuantity(item.lineId, -1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-muted text-slate-600 dark:text-muted-foreground transition-colors hover:bg-slate-200 dark:hover:bg-muted/70">
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="min-w-4 text-center text-sm font-semibold text-slate-700 dark:text-foreground">{item.quantity}</span>
                              <button type="button" onClick={() => updateQuantity(item.lineId, 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-muted text-slate-600 dark:text-muted-foreground transition-colors hover:bg-slate-200 dark:hover:bg-muted/70">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          <div className="flex h-full shrink-0 flex-col items-end justify-between gap-2 overflow-hidden text-right">
                            <button type="button" onClick={() => removeItem(item.lineId)} className="shrink-0 p-1 hover:bg-slate-50 dark:hover:bg-muted transition-colors rounded-full">
                              <X className="h-4 w-4 text-slate-300 hover:text-slate-500" />
                            </button>
                            <p className="truncate text-sm font-bold text-slate-800 dark:text-foreground">{formatCurrency(item.price * item.quantity)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tarjeta de sellos */}
                {selectedClient && isStampsMode && loyaltySettings && (
                  <div className="w-full rounded-[1.75rem] border border-slate-100 bg-[#f8f8fb] dark:bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-slate-400" />
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Tarjeta de sellos</p>
                      </div>
                      <p className="text-xs font-bold text-slate-600 dark:text-foreground">
                        {selectedClient.stamps || 0}/{loyaltySettings.stamps_required}
                      </p>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {Array.from({ length: loyaltySettings.stamps_required }).map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                            i < (selectedClient.stamps || 0)
                              ? "bg-[#d8ff55] text-slate-900"
                              : "bg-white dark:bg-card text-slate-300 border border-dashed border-slate-200 dark:border-border"
                          )}
                        >
                          {i < (selectedClient.stamps || 0) ? "✓" : ""}
                        </span>
                      ))}
                    </div>
                    <p className="mb-3 text-xs text-slate-500 dark:text-muted-foreground">
                      Esta venta suma 1 sello automáticamente.
                    </p>
                    {(selectedClient.stamps || 0) >= loyaltySettings.stamps_required && (
                      <button
                        type="button"
                        onClick={() => setRedeemStampGift(!redeemStampGift)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[1.25rem] border p-3 text-left transition-all",
                          redeemStampGift
                            ? "border-transparent bg-[#1f2030] text-[#d8ff55]"
                            : "border-[#d8ff55] bg-[#d8ff55]/15 hover:bg-[#d8ff55]/25"
                        )}
                      >
                        <span className="text-lg">{redeemStampGift ? "✅" : "🎁"}</span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-sm font-bold", !redeemStampGift && "text-slate-800 dark:text-foreground")}>
                            ¡Tarjeta completa! Entregar: {loyaltySettings.stamp_reward || "regalo"}
                          </p>
                          <p className={cn("text-xs", redeemStampGift ? "text-[#d8ff55]/70" : "text-slate-500")}>
                            {redeemStampGift ? "Se canjea al finalizar la venta" : "Tocá para canjear en esta venta"}
                          </p>
                        </div>
                      </button>
                    )}
                  </div>
                )}

                {/* Canje de premios (modo puntos) */}
                {selectedClient && !isStampsMode && rewards.length > 0 && (
                  <div className="w-full rounded-[1.75rem] border border-slate-100 bg-[#f8f8fb] dark:bg-muted/30 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Gift className="h-4 w-4 text-slate-400" />
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Canjear premio</p>
                    </div>
                    <div className="space-y-2">
                      {rewards.map((reward) => {
                        const affordable = (selectedClient.points || 0) >= reward.points_cost
                        const isRedeeming = redeemedReward?.id === reward.id
                        return (
                          <button
                            key={reward.id}
                            type="button"
                            disabled={!affordable}
                            onClick={() => setRedeemedReward(isRedeeming ? null : reward)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-[1.25rem] border p-3 text-left transition-all",
                              isRedeeming
                                ? "border-transparent bg-[#1f2030] text-[#d8ff55]"
                                : affordable
                                  ? "border-slate-200 dark:border-border bg-white dark:bg-card hover:border-slate-300"
                                  : "border-slate-100 dark:border-border/50 bg-white/60 dark:bg-card/50 opacity-50 cursor-not-allowed"
                            )}
                          >
                            <span className="text-lg flex-shrink-0">{isRedeeming ? "✅" : affordable ? "🎁" : "🔒"}</span>
                            <div className="min-w-0 flex-1">
                              <p className={cn("truncate text-sm font-semibold", !isRedeeming && "text-slate-800 dark:text-foreground")}>
                                {reward.name}
                              </p>
                              <p className={cn("text-xs", isRedeeming ? "text-[#d8ff55]/70" : "text-slate-400")}>
                                {reward.points_cost.toLocaleString("es-AR")} puntos
                                {reward.reward_value ? ` · ${reward.reward_value}` : ""}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
            </div>

            {/* Pago + factura — fijo abajo */}
            <div
              className="flex-shrink-0 px-3 sm:px-4 pt-2.5 pb-3 sm:pb-4 space-y-2.5 border-t border-slate-100 dark:border-border text-left"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              {saleSuccess ? (
                posPrintPhase ? (
                  /* Fases de impresión: imprimiendo → impreso (igual que /pedidos) */
                  <motion.div
                    key={posPrintPhase}
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-4 rounded-[1.5rem] py-14 text-white shadow-lg",
                      posPrintPhase === "printing" ? "bg-[#1f2030]" : "bg-emerald-500"
                    )}
                  >
                    {posPrintPhase === "printing" ? (
                      <>
                        <div className="flex flex-col items-center">
                          <Printer className="h-16 w-16 text-[#d8ff55]" />
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: [0, 44, 44], opacity: [0, 1, 1], y: [0, 2, 6] }}
                            transition={{ duration: 1.3, repeat: Infinity, repeatDelay: 0.15, ease: "easeInOut" }}
                            className="mt-1 w-16 overflow-hidden rounded-b-md bg-white shadow-md"
                          >
                            <div className="mx-2 mt-2 space-y-1.5">
                              <div className="h-1 rounded bg-neutral-300" />
                              <div className="h-1 rounded bg-neutral-300" />
                              <div className="h-1 w-2/3 rounded bg-neutral-300" />
                            </div>
                          </motion.div>
                        </div>
                        <p className="text-sm font-black uppercase tracking-[0.2em] text-[#d8ff55]">Imprimiendo ticket…</p>
                      </>
                    ) : (
                      <>
                        <motion.div
                          initial={{ scale: 0, rotate: -30 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
                          className="relative"
                        >
                          <span className="absolute inset-0 rounded-full bg-white/25 animate-ping" />
                          <CheckCircle2 className="relative h-20 w-20" />
                        </motion.div>
                        <p className="text-lg font-black tracking-wide">¡Ticket impreso!</p>
                        <Button
                          onClick={resetSale}
                          className="h-10 w-full max-w-[220px] rounded-xl bg-white font-bold text-[#1C1C28] hover:bg-white/90"
                        >
                          Listo
                        </Button>
                      </>
                    )}
                  </motion.div>
                ) : (
                /* Animación de confirmación: cubre todo el bloque de pago */
                <motion.div
                  key={saleSuccess}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-3 rounded-[1.5rem] py-10 text-white shadow-lg",
                    saleSuccess === "completed" ? "bg-emerald-500" : "bg-[#1f2030]"
                  )}
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.12 }}
                    className="relative"
                  >
                    <span className={cn("absolute inset-0 rounded-full animate-ping", saleSuccess === "completed" ? "bg-white/25" : "bg-[#d8ff55]/20")} />
                    {saleSuccess === "completed" ? (
                      <CheckCircle2 className="relative h-20 w-20" />
                    ) : (
                      <ReceiptText className="relative h-20 w-20 text-[#d8ff55]" />
                    )}
                  </motion.div>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className={cn("text-lg font-black tracking-wide", saleSuccess === "pending" && "text-[#d8ff55]")}
                  >
                    {saleSuccess === "completed" ? "¡Venta completada!" : "¡Pedido pasado!"}
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.45 }}
                    className={cn("text-sm font-semibold", saleSuccess === "completed" ? "text-white/85" : "text-white/70")}
                  >
                    {saleSuccess === "completed"
                      ? formatCurrency(total)
                      : `${formatCurrency(total)} · queda pendiente de cobro en Pedidos`}
                  </motion.p>

                  {/* Acciones: imprimir el ticket al toque o cerrar */}
                  {lastTicket ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="mt-2 flex w-full max-w-[240px] flex-col gap-2"
                    >
                      <Button
                        onClick={handlePosPrint}
                        className="h-10 w-full rounded-xl bg-white/15 font-bold text-white hover:bg-white/25 gap-2 backdrop-blur-sm"
                      >
                        <Printer className="h-4 w-4" /> Imprimir ticket
                      </Button>
                      <Button
                        onClick={resetSale}
                        className="h-10 w-full rounded-xl bg-white font-bold text-[#1C1C28] hover:bg-white/90"
                      >
                        Listo
                      </Button>
                    </motion.div>
                  ) : (
                    <p className={cn("mt-1 flex items-center gap-1.5 text-xs", saleSuccess === "completed" ? "text-white/70" : "text-white/50")}>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…
                    </p>
                  )}
                </motion.div>
                )
              ) : (
              <>
                <div>
                  <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">Metodo de pago</p>
                  <div className="grid grid-cols-2 gap-2">
                    {enabledPaymentOptions.map((option) => {
                      const Icon = option.icon
                      const isActive = paymentMethod === option.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          // Tocar de nuevo deselecciona (el pedido puede pasarse sin método de pago)
                          onClick={() => setPaymentMethod((prev) => (prev === option.id ? null : option.id))}
                          className={cn(
                            "flex items-center justify-center gap-2 rounded-xl border px-2 py-2 text-xs font-semibold transition-all active:scale-95",
                            isActive
                              ? "border-transparent bg-[#1f2030] text-[#d8ff55] shadow-md"
                              : "border-slate-200 dark:border-border bg-white dark:bg-card text-slate-500 dark:text-muted-foreground hover:border-slate-300 hover:text-slate-700 dark:hover:text-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{option.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="w-full rounded-[1.5rem] border border-slate-100 dark:border-border bg-white dark:bg-card p-3 shadow-sm dark:shadow-none">
                  <div className="space-y-1.5 text-sm text-slate-500 dark:text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Subtotal</span>
                      <span className="font-semibold text-slate-700 dark:text-foreground">{formatCurrency(subtotal)}</span>
                    </div>
                    {rewardDiscount > 0 && redeemedReward && (
                      <div className="flex items-center justify-between text-emerald-600">
                        <span className="truncate pr-2">🎁 {redeemedReward.name}</span>
                        <span className="font-semibold">-{formatCurrency(rewardDiscount)}</span>
                      </div>
                    )}
                    {tip > 0 && (
                      <div className="flex items-center justify-between">
                        <span>Propina / extra</span>
                        <span className="font-semibold text-slate-700 dark:text-foreground">+{formatCurrency(tip)}</span>
                      </div>
                    )}
                  </div>

                  {/* Propina / extra */}
                  {posSettings.tip_enabled && cartItems.length > 0 && (
                    <div className="mt-2.5 flex items-center gap-2 border-t border-slate-100 dark:border-border pt-2.5">
                      <span className="text-xs text-slate-400 flex-shrink-0">Propina</span>
                      <button
                        type="button"
                        onClick={() => setTipMode(tipMode === "auto" ? "off" : "auto")}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-bold transition-colors flex-shrink-0",
                          tipMode === "auto"
                            ? "bg-[#1f2030] text-[#d8ff55]"
                            : "bg-slate-100 dark:bg-muted text-slate-600 dark:text-muted-foreground hover:bg-slate-200"
                        )}
                      >
                        {posSettings.tip_percent}%
                      </button>
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                        <NumberInput
                          value={tip || null}
                          onValueChange={(v) => { setTipMode("custom"); setCustomTip(v ?? 0) }}
                          placeholder="Otro monto"
                          className="h-8 pl-5 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-2.5 flex flex-wrap items-end justify-between border-t border-slate-100 dark:border-border pt-2.5 gap-2">
                    <p className="text-sm font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-muted-foreground">Total</p>
                    <p className="min-w-0 truncate text-xl font-black tracking-tight text-slate-900 dark:text-foreground sm:text-2xl">{formatCurrency(total)}</p>
                  </div>

                  {/* Paga con → vuelto (solo efectivo) */}
                  {paymentMethod === "cash" && cartItems.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 flex-shrink-0 w-[68px]">Paga con</span>
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                          <NumberInput
                            value={amountPaid === "" ? null : Number(amountPaid)}
                            onValueChange={(v) => setAmountPaid(v == null ? "" : String(v))}
                            placeholder="Monto recibido"
                            className="h-8 pl-5 text-sm"
                          />
                        </div>
                      </div>
                      {paidNum > 0 && (
                        <div className="flex items-center justify-between text-sm px-0.5">
                          <span className={change >= 0 ? "text-slate-500 dark:text-muted-foreground" : "text-red-500"}>
                            {change >= 0 ? "Vuelto" : "Falta"}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={cn("font-bold", change >= 0 ? "text-slate-800 dark:text-foreground" : "text-red-500")}>
                              {formatCurrency(Math.abs(change))}
                            </span>
                            {change > 0 && (
                              <button
                                type="button"
                                onClick={() => { setTipMode("custom"); setCustomTip(Number((tip + change).toFixed(2))) }}
                                className="rounded-full bg-[#d8ff55]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1f2030] dark:text-[#d8ff55] hover:bg-[#d8ff55]/35 transition-colors"
                              >
                                Dejar de propina
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {cartItems.length > 0 && (
                    <div className="mt-2.5 flex items-start gap-2">
                      <StickyNote className="mt-2 h-4 w-4 shrink-0 text-slate-400" />
                      <Input
                        value={orderNote}
                        onChange={(e) => setOrderNote(e.target.value)}
                        placeholder="Nota / mensaje del pedido (opcional)"
                        className="h-8 text-sm"
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-2 mt-3">
                    {paymentMethod === "qr" ? (
                      <Button
                        onClick={generateMpQr}
                        disabled={mpQrLoading || cartItems.length === 0}
                        className="h-12 w-full rounded-[1.25rem] bg-[#009ee3] text-sm font-bold uppercase tracking-[0.2em] text-white hover:bg-[#0089c7]"
                      >
                        {mpQrLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            Cobrar con QR
                            <QrCode className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        onClick={finalizeSale}
                        disabled={isSubmitting || cartItems.length === 0 || !paymentMethod}
                        className="h-12 w-full rounded-[1.25rem] bg-[#d8ff55] text-sm font-bold uppercase tracking-[0.25em] text-slate-900 hover:bg-[#c8ef42] disabled:opacity-60"
                      >
                        {isSubmitting ? "Procesando..." : !paymentMethod ? "Elegí un método de pago" : "Finalizar venta"}
                        {paymentMethod && !isSubmitting && <CheckCircle2 className="ml-2 h-4 w-4" />}
                      </Button>
                    )}
                    <Button
                      onClick={moveOrder}
                      disabled={isSubmitting || cartItems.length === 0}
                      variant="outline"
                      className="h-11 w-full rounded-[1.25rem] border-slate-200 dark:border-border text-sm font-bold uppercase tracking-[0.25em] text-slate-600 dark:text-muted-foreground hover:bg-slate-50 dark:hover:bg-muted hover:text-slate-900 dark:hover:text-foreground"
                    >
                      Pasar pedido
                    </Button>
                  </div>
                </div>
              </>
              )}
            </div>
          </div>
        </aside>
      </div>

      <LoyaltyScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} onScan={handleCardScan} />

      {/* QR de cobro con Mercado Pago */}
      <Dialog open={!!mpQr} onOpenChange={(o) => { if (!o) { setMpQr(null); setMpQrOrderId(null); setMpQrPaid(false) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-[#009ee3]" />
              Cobrar {formatCurrency(total)}
            </DialogTitle>
          </DialogHeader>
          {mpQr && (
            mpQrPaid ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 14 }}
                  className="relative"
                >
                  <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
                  <CheckCircle2 className="relative h-20 w-20 text-emerald-500" />
                </motion.div>
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 }}
                  className="text-lg font-bold"
                >
                  ¡Pago recibido!
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.32 }}
                  className="text-sm text-muted-foreground"
                >
                  Finalizando la venta…
                </motion.p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-2">
                <div className="rounded-xl bg-white p-4">
                  <QRCode value={mpQr} size={220} />
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  El cliente escanea con <strong>cualquier billetera</strong> (Mercado Pago, MODO, Ualá, banco…) y paga.
                  Acá te avisamos cuando se acredite.
                </p>
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Esperando el pago…
                </span>
              </div>
            )
          )}
        </DialogContent>
      </Dialog>

      <CashSessionDialog
        open={cashDialogOpen}
        onOpenChange={setCashDialogOpen}
        userId={userId}
        businessName={businessName}
        ticketWidth={(posSettings.ticket_width as TicketWidth) || 80}
        activeSession={cashSession}
        onSessionChange={setCashSession}
      />

      <PosSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        userId={userId}
        settings={posSettings}
        onSaved={(s) => {
          setPosSettings(s)
          // Si el medio de pago elegido quedó deshabilitado, pasar al primero válido
          if (paymentMethod && !s.payment_methods.includes(paymentMethod)) setPaymentMethod(null)
          // Al reactivar la propina vuelve al modo automático (aplica el % sugerido solo)
          if (s.tip_enabled) setTipMode("auto")
        }}
      />

      {/* Modal centrado para elegir las opciones del producto (ej: tipo de bebida) */}
      <PosOptionPickerDialog
        open={!!pickerProduct}
        product={pickerProduct}
        groups={pickerProduct ? optionsByProduct[pickerProduct.id] || [] : []}
        onCancel={() => setPickerProduct(null)}
        onConfirm={(selected, extra) => {
          if (pickerProduct) addLine(pickerProduct, selected, extra)
          setPickerProduct(null)
        }}
      />

      {!isCartOpen && cartItems.length > 0 && (
        <motion.button
          type="button"
          onClick={() => setIsCartOpen(true)}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          // bottom-24: queda por encima del downbar móvil (que ocupa ~5.5rem abajo)
          className="fixed bottom-24 right-4 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-[#1f2030] shadow-2xl lg:hidden"
          aria-label="Ver carrito"
        >
          <ReceiptText className="h-6 w-6 text-[#d8ff55]" />
          <motion.span
            key={totalItems}
            initial={{ scale: 1.6 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#d8ff55] text-xs font-black text-slate-900"
          >
            {totalItems}
          </motion.span>
        </motion.button>
      )}
    </div>
  )
}