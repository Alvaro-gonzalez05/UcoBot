"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { ShoppingCart, Package, Edit, Trash2, Settings, MoreHorizontal, Filter, X, Search, MessageCircle, Camera, CreditCard, Building2, Banknote, Plus, Minus, ChevronRight, ChevronLeft, ShoppingBag, LayoutGrid, LayoutList, Tag, Printer, CheckCircle2 } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDistanceToNow, format } from "date-fns"
import { es } from "date-fns/locale"
import { ProductForm } from "./product-form"
import { ProductImportWizard } from "./product-import-wizard"
import { ProductOptionsManager } from "./product-options-manager"
import { ProductEditForm } from "./product-edit-form"
import { OrderCheckoutDialog, OrderCheckoutPanel, type PaymentRecord } from "./order-checkout-dialog"
import { printTicket, cleanTicketNotes } from "@/lib/print-ticket"
import { SheetGrabBar } from "@/components/ui/sheet-grab-bar"
import { toast } from "sonner"
import { DashboardPagination } from "./dashboard-pagination"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn, normalizeSearchText } from "@/lib/utils"

interface Order {
  id: string
  status: string
  total_amount: number
  delivery_phone: string
  customer_notes?: string
  delivery_address?: string
  order_type?: string
  items: any[]
  created_at: string
  client?: {
    name?: string
    phone?: string
  }
  conversation?: {
    platform?: string
  }
  tags?: string[]
  tip_amount?: number
  payments?: PaymentRecord[]
  source?: string
}

interface Product {
  id: string
  name: string
  description?: string
  price: number
  category?: string
  is_available: boolean
  image_url?: string
  created_at: string
}

interface DeliverySettings {
  id?: string
  pickup_enabled: boolean
  delivery_enabled: boolean
  pickup_instructions: string
  delivery_instructions: string
  delivery_fee: number
  minimum_order_delivery: number
  delivery_time_estimate: string
  pickup_time_estimate: string
}

interface PedidosClientProps {
  userId: string
  initialOrders: Order[]
  initialProducts: Product[]
  initialCategories: string[]
  deliverySettings?: DeliverySettings
  businessName?: string
  posTipEnabled?: boolean
  posTipPercent?: number
  pagination?: {
    page: number
    limit: number
    totalItems: number
    totalPages: number
  }
}

export function PedidosClient({
  userId,
  initialOrders,
  initialProducts,
  initialCategories,
  deliverySettings: initialDeliverySettings,
  businessName = "Mi Negocio",
  posTipEnabled = false,
  posTipPercent = 10,
  pagination
}: PedidosClientProps) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [categories, setCategories] = useState<string[]>(initialCategories)
  const [isLoading, setIsLoading] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  
  // Order management state
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [filterStatuses, setFilterStatuses] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid")
  // Pedido con confirmación de borrado activa (tarjeta en rojo)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Pedido que acaba de cambiar de estado (para el flash animado en su nuevo color)
  const [poppedId, setPoppedId] = useState<string | null>(null)
  // Estado editable del pedido en la vista previa
  const [editItems, setEditItems] = useState<{ product_id: string | null; name: string; price: number; quantity: number; image_url: string | null; options?: any[] }[]>([])
  const [editStatus, setEditStatus] = useState("pending")
  const [editAddress, setEditAddress] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [addSearch, setAddSearch] = useState("")
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [checkoutOrder, setCheckoutOrder] = useState<Order | null>(null)
  const [ticketWidth, setTicketWidth] = useState<58 | 80>(80)
  const [isPrintingTicket, setIsPrintingTicket] = useState(false)
  // Animación de impresión a pantalla completa del panel: imprimiendo → impreso
  const [printPhase, setPrintPhase] = useState<null | "printing" | "done">(null)
  // Feedback "+1" en el dropdown de agregar productos
  const [justAddedRow, setJustAddedRow] = useState<{ id: string; nonce: number } | null>(null)
  // Carrito de selección del dropdown: lo tocado se acumula acá y entra al pedido al confirmar
  const [staged, setStaged] = useState<{ id: string; name: string; price: number; image_url: string | null; qty: number }[]>([])
  const [addConfirmPhase, setAddConfirmPhase] = useState(false)
  // Modo del modal de detalle: edición, cobro o vista previa de impresión (se intercambian con animación)
  const [detailMode, setDetailMode] = useState<"edit" | "checkout" | "print">("edit")
  const [orderSearch, setOrderSearch] = useState("")
  // Tab activo: el buscador del header cambia según dónde estés (pedidos ↔ productos)
  const [activeTab, setActiveTab] = useState("orders")
  const [productTabSearch, setProductTabSearch] = useState("")
  const [productTabCategory, setProductTabCategory] = useState("Todos")
  const supabase = createClient()
  const router = useRouter()

  // Ancho del ticket configurado por el negocio (58/80mm) para imprimir bien
  useEffect(() => {
    supabase
      .from("pos_settings")
      .select("ticket_width")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.ticket_width === 58 || data?.ticket_width === 80) setTicketWidth(data.ticket_width)
      })
  }, [])

  // Extract unique tags from all orders
  const allTags = Array.from(new Set(orders.flatMap(o => o.tags || []))).sort()


  // Make sure we have a reliable audio element
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    // Setup Supabase Realtime for orders table
    const channel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newOrder = payload.new as Order
            toast.success(`¡Nuevo pedido recibido! (#${newOrder.id.slice(0, 5)})`)
            setOrders(prev => [newOrder, ...prev])
            
            // Reproducir sonido usando la etiqueta <audio> fijada al dom
            if (audioRef.current) {
              audioRef.current.currentTime = 0
              audioRef.current.volume = 1.0
              audioRef.current.play().catch(e => {
                console.log('Autoplay bloqueado. Has clic en cualquier parte de la pantalla antes de la primera venta para autorizar el sonido.', e)
                toast('Notificación de audio silenciada', {
                  description: 'Haz clic en cualquier parte de la pantalla de Pedidos para permitir notificaciones sonoras.',
                })
              })
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedOrder = payload.new as Order
            setOrders(prev => prev.map(o => o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o))
          } else if (payload.eventType === 'DELETE') {
            const deletedOrder = payload.old as Order
            setOrders(prev => prev.filter(o => o.id !== deletedOrder.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  // (El resaltado de pedidos pendientes ahora es una animación CSS liviana —
  //  ver .order-card-pending en globals.css. Antes era GSAP animando box-shadow
  //  de forma infinita, que trababa los celulares de gama baja.)

  // Filter orders based on search + selected tags + status
  const filteredOrders = orders.filter(order => {
    if (orderSearch.trim()) {
      const q = normalizeSearchText(orderSearch.trim())
      const hay = normalizeSearchText(`${order.id} ${order.client?.name || ""} ${order.delivery_phone || ""}`)
      if (!hay.includes(q)) return false
    }
    if (filterStatuses.length > 0 && !filterStatuses.includes(order.status)) return false
    if (selectedTags.length === 0) return true
    if (!order.tags) return false
    return selectedTags.every(tag => order.tags?.includes(tag))
  })

  const activeFilterCount = selectedTags.length + filterStatuses.length

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const toggleStatusFilter = (status: string) => {
    setFilterStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    )
  }

  const clearAllFilters = () => {
    setSelectedTags([])
    setFilterStatuses([])
  }

  // Estados disponibles para filtrar
  const ALL_STATUSES = ["pending", "confirmed", "preparing", "ready", "delivered", "completed", "cancelled"]

  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings>(
    initialDeliverySettings || {
      pickup_enabled: true,
      delivery_enabled: false,
      pickup_instructions: 'Retiro en el local',
      delivery_instructions: 'Envío a domicilio',
      delivery_fee: 0,
      minimum_order_delivery: 0,
      delivery_time_estimate: '30-45 minutos',
      pickup_time_estimate: '15-20 minutos',
    }
  )

  const refreshProducts = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/products")
      const data = await response.json()
      
      if (response.ok) {
        setProducts(data.products)
        setCategories(data.categories)
      }
    } catch (error) {
      console.error("Error refreshing products:", error)
      toast.error("Error al cargar productos")
    } finally {
      setIsLoading(false)
    }
  }

  const saveDeliverySettings = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/delivery-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(deliverySettings),
      })

      if (response.ok) {
        toast.success("Configuración de modalidades guardada")
      } else {
        toast.error("Error al guardar configuración")
      }
    } catch (error) {
      console.error("Error saving delivery settings:", error)
      toast.error("Error al guardar configuración")
    } finally {
      setIsLoading(false)
    }
  }

  // Eliminar: en vez de un toast, la tarjeta se pone roja y pide confirmación in-situ
  const handleDeleteOrder = (orderId: string) => setDeletingId(orderId)

  const performDeleteOrder = async (orderId: string) => {
    // Optimista: sacamos el pedido de la lista → dispara la animación de salida
    // (se desliza al costado) y las de abajo suben suave con el layout animation.
    setDeletingId(null)
    const snapshot = orders
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
    try {
      const { error } = await supabase.from("orders").delete().eq("id", orderId)
      if (error) throw error
      // Sin toast: la animación ya confirma la eliminación
    } catch (error) {
      console.error("Error deleting order:", error)
      toast.error("No se pudo eliminar el pedido")
      setOrders(snapshot) // restaurar si falló
    }
  }

  // Overlay rojo de confirmación que cubre la tarjeta del pedido a eliminar
  const renderDeleteOverlay = (orderId: string) =>
    deletingId === orderId ? (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-3xl bg-red-500 p-4 text-center text-white"
      >
        <motion.div initial={{ scale: 0.5, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 14 }}>
          <Trash2 className="h-9 w-9" />
        </motion.div>
        <p className="text-sm font-bold leading-snug">¿Seguro que querés<br />eliminar este pedido?</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDeletingId(null)}
            className="rounded-xl bg-white/20 px-4 py-2 text-sm font-bold hover:bg-white/30 transition-colors active:scale-95"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => performDeleteOrder(orderId)}
            className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-red-600 hover:bg-white/90 transition-colors active:scale-95 gap-1 inline-flex items-center"
          >
            <Trash2 className="h-4 w-4" /> Sí, eliminar
          </button>
        </div>
      </motion.div>
    ) : null

  // Flash animado (anillo del color del nuevo estado) cuando el pedido cambia de estado
  const renderStatusFlash = (order: Order) => (
    <AnimatePresence>
      {poppedId === order.id && (
        <motion.div
          key="flash"
          initial={{ opacity: 0.85, scale: 1 }}
          animate={{ opacity: 0, scale: 1.03 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
          className={cn("pointer-events-none absolute inset-0 z-20 rounded-3xl ring-4", getStatusRing(order.status))}
        />
      )}
    </AnimatePresence>
  )

  // Flujo lineal de estados para el botón "Procesar pedido"
  const STATUS_FLOW = ["pending", "confirmed", "preparing", "ready", "completed"]
  const nextStatusOf = (s: string) => {
    const i = STATUS_FLOW.indexOf(s)
    return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : null
  }

  // Avanza el pedido al siguiente estado del flujo (sin abrir el formulario)
  const advanceOrderStatus = async (order: Order) => {
    const next = nextStatusOf(order.status)
    if (!next) return
    // Finalizar exige cobro: al pasar a "completado" abrimos el cobro del pedido.
    if (next === "completed") { openCheckout(order); return }
    try {
      const { data, error } = await supabase
        .from("orders")
        .update({ status: next })
        .eq("id", order.id)
        .select()
        .single()
      if (error) throw error
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...data } : o)))
      // Sin toast: la tarjeta se recolorea al nuevo estado y hace un flash animado
      setPoppedId(order.id)
      window.setTimeout(() => setPoppedId((p) => (p === order.id ? null : p)), 700)
    } catch (error) {
      console.error("Error advancing order status:", error)
      toast.error("No se pudo actualizar el estado")
    }
  }

  // Abre el diálogo de cobro para cerrar la venta
  const openCheckout = (order: Order) => setCheckoutOrder(order)

  const handleOrderFinalized = (orderId: string) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: "completed" } : o)))
    setCheckoutOrder(null)
  }

  // Abre la vista previa/edición del pedido
  const openDetail = (order: Order) => {
    setSelectedOrder(order)
    setEditStatus(order.status)
    setEditAddress(order.delivery_address || "")
    setEditNotes(order.customer_notes || "")
    setEditItems(
      (Array.isArray(order.items) ? order.items : []).map((it: any) => ({
        product_id: it.product_id ?? null,
        name: it.name || it.product_name || "Producto",
        price: Number(it.price) || 0,
        quantity: Number(it.quantity) || 1,
        image_url: it.image_url || null,
        options: Array.isArray(it.options) && it.options.length ? it.options : undefined,
      }))
    )
    setAddSearch("")
    setShowAddProduct(false)
    setDetailMode("edit")
    setIsDetailOpen(true)
  }

  const editTotal = editItems.reduce((sum, i) => sum + i.price * i.quantity, 0)

  // Tocar un producto NO lo agrega directo: lo suma al carrito de selección del dropdown
  const stageProduct = (p: Product) => {
    setStaged((prev) => {
      const ex = prev.find((s) => s.id === p.id)
      if (ex) return prev.map((s) => (s.id === p.id ? { ...s, qty: s.qty + 1 } : s))
      return [...prev, { id: p.id, name: p.name, price: Number(p.price) || 0, image_url: p.image_url || null, qty: 1 }]
    })
    // Feedback "+1" sobre la fila tocada
    setJustAddedRow({ id: p.id, nonce: Date.now() })
    window.setTimeout(() => setJustAddedRow((prev) => (prev?.id === p.id ? null : prev)), 650)
  }

  const unstageProduct = (id: string) => {
    setStaged((prev) =>
      prev
        .map((s) => (s.id === id ? { ...s, qty: s.qty - 1 } : s))
        .filter((s) => s.qty > 0)
    )
  }

  const closeAddDropdown = () => {
    setShowAddProduct(false)
    setStaged([])
    setAddSearch("")
  }

  // Confirma la selección: animación de check en el dropdown y recién ahí entran al pedido
  const confirmStaged = () => {
    if (staged.length === 0) return
    setAddConfirmPhase(true)
    window.setTimeout(() => {
      setEditItems((prev) => {
        const next = [...prev]
        const newOnes: typeof prev = []
        for (const s of staged) {
          const idx = next.findIndex((i) => i.product_id === s.id)
          if (idx >= 0) next[idx] = { ...next[idx], quantity: next[idx].quantity + s.qty }
          else newOnes.push({ product_id: s.id, name: s.name, price: s.price, quantity: s.qty, image_url: s.image_url })
        }
        // Los nuevos van arriba para que se los vea entrar (animados)
        return [...newOnes, ...next]
      })
      setAddConfirmPhase(false)
      closeAddDropdown()
    }, 950)
  }

  const stagedCount = staged.reduce((s, i) => s + i.qty, 0)
  const stagedTotal = staged.reduce((s, i) => s + i.price * i.qty, 0)

  // Productos del tab Catálogo filtrados por buscador (sin acentos) y categoría.
  // Con búsqueda activa se ignora la categoría (búsqueda global, como en el POS).
  const productsTabFiltered = products.filter((p) => {
    const q = normalizeSearchText(productTabSearch.trim())
    if (q) return normalizeSearchText(`${p.name} ${p.description ?? ""} ${p.category ?? ""}`).includes(q)
    if (productTabCategory !== "Todos") return p.category === productTabCategory
    return true
  })

  // Al escribir, la categoría vuelve a "Todos" para que la UI coincida con los resultados
  const handleProductTabSearch = (value: string) => {
    setProductTabSearch(value)
    if (value.trim() && productTabCategory !== "Todos") setProductTabCategory("Todos")
  }

  // Productos que matchean el buscador del panel "Agregar" (sin acentos)
  const addMatches = products.filter((p) =>
    normalizeSearchText(`${p.name} ${p.category ?? ""}`).includes(normalizeSearchText(addSearch.trim()))
  )

  // Nombres de las opciones de un item (soporta strings u objetos {name})
  const optionNames = (opts?: any[]): string[] =>
    (opts || []).map((o) => (typeof o === "string" ? o : o?.name)).filter(Boolean)

  // Cobra desde el modal: guarda los items editados, los pagos y cierra la venta en un solo paso
  const finalizeFromModal = async (payments: PaymentRecord[]) => {
    if (!selectedOrder) return
    try {
      const items = editItems.map((i) => ({
        product_id: i.product_id,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        subtotal: Number((i.price * i.quantity).toFixed(2)),
        image_url: i.image_url || null,
        options: i.options && i.options.length ? i.options : undefined,
      }))
      // Las propinas dejadas del vuelto se suman a la propina recalculada del pedido
      const tipsFromPayments = payments.reduce((s, p) => s + (p.tip || 0), 0)
      const finalTip = Number((ticketTip + tipsFromPayments).toFixed(2))
      const { data, error } = await supabase
        .from("orders")
        .update({
          status: "completed",
          items,
          // total = productos + propina (recalculada sobre el total actual)
          total_amount: Number((editTotal + ticketTip).toFixed(2)),
          tip_amount: finalTip,
          delivery_address: editAddress,
          customer_notes: editNotes,
          payments,
        })
        .eq("id", selectedOrder.id)
        .select()
        .single()
      if (error) throw error
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, ...data } : o)))
      // Sin toast: la animación verde de venta completada ya lo confirma
      setIsDetailOpen(false)
      setDetailMode("edit")
    } catch (error) {
      console.error("Error finalizing order:", error)
      toast.error("No se pudo finalizar la venta")
    }
  }

  // Pagos parciales del "cobrar por separado": se persisten al toque
  const savePartialPayments = async (payments: PaymentRecord[]) => {
    if (!selectedOrder) return
    await supabase.from("orders").update({ payments }).eq("id", selectedOrder.id)
    setSelectedOrder((prev) => (prev ? { ...prev, payments } : prev))
    setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, payments } : o)))
  }

  // Quita un pago ya registrado (deshacer cobro). Si tenía propina, se descuenta también.
  const removePayment = async (index: number) => {
    if (!selectedOrder) return
    const current = selectedOrder.payments || []
    const removed = current[index]
    if (!removed) return
    const next = current.filter((_, i) => i !== index)
    const newTip = Math.max(0, Number(((selectedOrder.tip_amount || 0) - (removed.tip || 0)).toFixed(2)))
    // Si el pedido estaba finalizado, al quitarle un pago deja de estar completo → vuelve a "Listo"
    const revertStatus = selectedOrder.status === "completed" ? "ready" : null
    try {
      const { error } = await supabase
        .from("orders")
        .update({ payments: next, tip_amount: newTip, ...(revertStatus ? { status: revertStatus } : {}) })
        .eq("id", selectedOrder.id)
      if (error) throw error
      setSelectedOrder((prev) => (prev ? { ...prev, payments: next, tip_amount: newTip, ...(revertStatus ? { status: revertStatus } : {}) } : prev))
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, payments: next, tip_amount: newTip, ...(revertStatus ? { status: revertStatus } : {}) } : o)))
      if (revertStatus) setEditStatus(revertStatus)
      toast.success(`Pago quitado (${removed.label || removed.method}: ${formatCurrency(removed.amount + (removed.tip || 0))})${revertStatus ? " · el pedido volvió a Listo" : ""}`)
    } catch (error) {
      console.error("Error removing payment:", error)
      toast.error("No se pudo quitar el pago")
    }
  }

  // Propina: en pedidos del POS todavía sin cobrar se RECALCULA en vivo como el % de la
  // config sobre el total actual (si agregás productos, cambia). En pedidos ya cobrados
  // se respeta la propina registrada. Nunca es un producto: es un cálculo sobre el total.
  const orderIsPosOpen =
    selectedOrder?.source === "pos" &&
    selectedOrder?.status !== "completed" &&
    selectedOrder?.status !== "cancelled"
  const ticketTip =
    orderIsPosOpen && posTipEnabled
      ? Math.round(editTotal * (posTipPercent / 100))
      : selectedOrder?.tip_amount || 0

  // Imprime el ticket con lo que se ve en pantalla (items editados incluidos)
  const handlePrintTicket = () => {
    if (!selectedOrder) return
    setDetailMode("print")
    setIsPrintingTicket(true)
    // Animación del panel completo: "imprimiendo" → "impreso".
    // El check queda fijo hasta que el usuario vuelva al pedido o cierre el modal.
    setPrintPhase("printing")
    window.setTimeout(() => setPrintPhase((p) => (p === "printing" ? "done" : p)), 1500)
    printTicket({
      businessName,
      orderId: selectedOrder.id,
      clientName: getOrderClientName(selectedOrder),
      orderType: getOrderModalityLabel(selectedOrder),
      items: editItems.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, options: optionNames(i.options) })),
      total: editTotal + ticketTip,
      tipAmount: ticketTip || undefined,
      payments: selectedOrder.payments,
      notes: editNotes || undefined,
    }, ticketWidth, {
      onComplete: () => {
        setIsPrintingTicket(false)
        setDetailMode("print")
      },
    })
  }

  const updateItemQty = (index: number, delta: number) => {
    setEditItems((prev) =>
      prev
        .map((i, idx) => (idx === index ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    )
  }

  const removeEditItem = (index: number) => {
    setEditItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleSaveOrder = async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const items = editItems.map((i) => ({
        product_id: i.product_id,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        subtotal: Number((i.price * i.quantity).toFixed(2)),
        image_url: i.image_url || null,
        options: i.options && i.options.length ? i.options : undefined,
      }))
      const total = items.reduce((s, i) => s + i.price * i.quantity, 0)
      const { data, error } = await supabase
        .from("orders")
        .update({
          status: editStatus,
          items,
          total_amount: Number(total.toFixed(2)),
          delivery_address: editAddress,
          customer_notes: editNotes,
        })
        .eq("id", selectedOrder.id)
        .select()
        .single()

      if (error) throw error

      setOrders(orders.map((o) => (o.id === selectedOrder.id ? { ...o, ...data } : o)))
      toast.success("Pedido actualizado correctamente")
      setIsDetailOpen(false)
    } catch (error) {
      console.error("Error updating order:", error)
      toast.error("No se pudo actualizar el pedido")
    } finally {
      setIsLoading(false)
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(value)

  const getOrderTypeLabel = (orderType?: string) => {
    switch (orderType) {
      case 'pickup':
        return 'Retiro en el local'
      case 'delivery':
        return 'Envío a domicilio'
      default:
        return 'Retiro en el local'
    }
  }

  // Modalidad real del pedido: los del POS no son retiro/envío, son venta en el local
  const getOrderModalityLabel = (order: Order) =>
    order.source === "pos" ? "Punto de venta" : getOrderTypeLabel(order.order_type)

  // Nombre del cliente para mostrar/imprimir ("venta-local" es un placeholder interno, no un cliente)
  const getOrderClientName = (order: Order) => {
    if (order.client?.name) return order.client.name
    if (order.delivery_phone && order.delivery_phone !== "venta-local") return order.delivery_phone
    return undefined
  }

  const deleteProduct = async (productId: string) => {
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: "DELETE"
      })

      if (response.ok) {
        toast.success("Producto eliminado")
        refreshProducts()
      } else {
        throw new Error("Error al eliminar producto")
      }
    } catch (error) {
      console.error("Error deleting product:", error)
      toast.error("Error al eliminar producto")
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendiente'
      case 'confirmed': return 'Confirmado'
      case 'preparing': return 'Preparando'
      case 'ready': return 'Listo'
      case 'completed': return 'Finalizado'
      case 'delivered': return 'Entregado'
      case 'cancelled': return 'Cancelado'
      default: return status
    }
  }

  const getPlatformIcon = (platform?: string) => {
    if (platform === 'instagram') return <Camera className="h-4 w-4 text-pink-500" />
    return <MessageCircle className="h-4 w-4 text-green-500" />
  }

  // Colores SÓLIDOS por estado (estilo kanban), no el tinte neón translúcido anterior
  // Colores SÓLIDOS por estado (sin transparencias/opacidad → nada de "vidrio").
  // Relleno y borde del mismo color; el interior contrasta con texto oscuro (claro)
  // o claro (oscuro) según el tema.
  // Colores PASTEL sólidos por estado (sin transparencias). Fondo suave + borde
  // del mismo tono; el texto interior es oscuro (claro) o claro (oscuro) según tema.
  const getCardStyle = (status: string) => {
    switch (status) {
      case 'pending':    return 'bg-amber-100 border-amber-300 dark:bg-amber-950 dark:border-amber-800'
      case 'confirmed':  return 'bg-sky-100 border-sky-300 dark:bg-sky-950 dark:border-sky-800'
      case 'preparing':  return 'bg-orange-100 border-orange-300 dark:bg-orange-950 dark:border-orange-800'
      case 'ready':      return 'bg-emerald-100 border-emerald-300 dark:bg-emerald-950 dark:border-emerald-800'
      case 'completed':  return 'bg-slate-100 border-slate-300 dark:bg-slate-900 dark:border-slate-700'
      case 'delivered':  return 'bg-slate-100 border-slate-300 dark:bg-slate-900 dark:border-slate-700'
      case 'cancelled':  return 'bg-rose-100 border-rose-300 dark:bg-rose-950 dark:border-rose-900 line-through'
      default:           return 'bg-card border-border'
    }
  }

  // Color del anillo del flash cuando el pedido cambia de estado
  const getStatusRing = (status: string) => {
    switch (status) {
      case 'pending':    return 'ring-amber-400'
      case 'confirmed':  return 'ring-sky-400'
      case 'preparing':  return 'ring-orange-400'
      case 'ready':      return 'ring-emerald-400'
      case 'completed':
      case 'delivered':  return 'ring-slate-400'
      case 'cancelled':  return 'ring-rose-400'
      default:           return 'ring-[#D1F366]'
    }
  }

  // Badges sólidos y saturados, alineados al color de cada estado (resaltan sobre la tarjeta pastel)
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending':    return 'bg-amber-500 text-white border border-amber-600'
      case 'confirmed':  return 'bg-sky-500 text-white border border-sky-600'
      case 'preparing':  return 'bg-orange-500 text-white border border-orange-600'
      case 'ready':      return 'bg-emerald-500 text-white border border-emerald-600'
      case 'completed':  return 'bg-slate-500 text-white border border-slate-600'
      case 'delivered':  return 'bg-slate-400 text-white border border-slate-500'
      case 'cancelled':  return 'bg-rose-500 text-white border border-rose-600 line-through'
      default:           return 'bg-gray-400 text-white border border-gray-500'
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <audio ref={audioRef} id="new-order-sound" src="/sounds/cash-register.mp3" preload="auto" />
      {/* Header */}
      <div className="flex justify-between items-center mb-3 sm:mb-6 px-1 pt-2">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold dark:text-white">Gestión de Pedidos</h2>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">Administración de órdenes y ventas en tiempo real.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-[#B3D93C] transition-colors" />
            <input
              className="pl-10 pr-4 py-2.5 rounded-full border border-border bg-card shadow-sm focus:ring-2 focus:ring-[#D1F366] focus:outline-none w-48 xl:w-64 text-sm text-foreground placeholder-muted-foreground transition-all"
              placeholder={activeTab === "products" ? "Buscar producto..." : "Buscar orden o cliente..."}
              type="text"
              value={activeTab === "products" ? productTabSearch : orderSearch}
              onChange={(e) => (activeTab === "products" ? handleProductTabSearch(e.target.value) : setOrderSearch(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Buscador en móvil (en desktop vive en el header) — cambia según el tab activo */}
      <div className="relative sm:hidden mb-3 px-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className="w-full pl-10 pr-4 py-2.5 rounded-full border border-border bg-card shadow-sm focus:ring-2 focus:ring-[#D1F366] focus:outline-none text-sm text-foreground placeholder-muted-foreground"
          placeholder={activeTab === "products" ? "Buscar producto..." : "Buscar orden o cliente..."}
          type="text"
          value={activeTab === "products" ? productTabSearch : orderSearch}
          onChange={(e) => (activeTab === "products" ? handleProductTabSearch(e.target.value) : setOrderSearch(e.target.value))}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start rounded-2xl bg-muted p-1 mb-4 h-auto overflow-x-auto">
          <TabsTrigger value="orders" className="rounded-xl flex items-center gap-1.5 sm:gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-3.5 sm:px-5 py-2 sm:py-2.5 font-semibold text-sm whitespace-nowrap shrink-0">
            <ShoppingCart className="h-4 w-4" />
            Pedidos
          </TabsTrigger>
          <TabsTrigger value="products" className="rounded-xl flex items-center gap-1.5 sm:gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-3.5 sm:px-5 py-2 sm:py-2.5 font-semibold text-sm whitespace-nowrap shrink-0">
            <Package className="h-4 w-4" />
            Productos
          </TabsTrigger>
          <TabsTrigger value="settings" className="rounded-xl flex items-center gap-1.5 sm:gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-3.5 sm:px-5 py-2 sm:py-2.5 font-semibold text-sm whitespace-nowrap shrink-0">
            <Settings className="h-4 w-4" />
            Configuración
          </TabsTrigger>
        </TabsList>

        {/* ─── ORDERS TAB ─── */}
        <TabsContent value="orders" className="flex-1 overflow-y-auto space-y-3 pr-1 mt-0">
          {/* Filters row */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xl font-bold dark:text-white">Órdenes Recientes</h3>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground">
                  Limpiar <X className="ml-1 h-3 w-3" />
                </Button>
              )}

              {/* Menú de filtros (3 puntitos): Estado + Etiquetas */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-full relative">
                    <MoreHorizontal className="h-4 w-4" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-[#D1F366] text-[#1C1C28] text-[10px] flex items-center justify-center font-bold">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold">Filtros</p>
                    {activeFilterCount > 0 && (
                      <button onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-foreground">Limpiar</button>
                    )}
                  </div>

                  {/* Estado del pedido */}
                  <p className="text-xs font-medium text-muted-foreground mb-1">Estado del pedido</p>
                  <div className="space-y-1">
                    {ALL_STATUSES.map((st) => (
                      <label key={st} className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-1 py-1 hover:bg-muted">
                        <input type="checkbox" checked={filterStatuses.includes(st)} onChange={() => toggleStatusFilter(st)} className="accent-[#B3D93C]" />
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadgeClass(st)}`}>{getStatusText(st).toUpperCase()}</span>
                      </label>
                    ))}
                  </div>

                  {/* Etiquetas */}
                  {allTags.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Etiquetas</p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {allTags.map((tag) => (
                          <label key={tag} className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-1 py-1 hover:bg-muted">
                            <input type="checkbox" checked={selectedTags.includes(tag)} onChange={() => toggleTag(tag)} className="accent-violet-500" />
                            <Tag className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
                            <span className="truncate">{tag}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              {/* Cambiar vista lista / tarjetas */}
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                title={viewMode === "list" ? "Ver como tarjetas" : "Ver como lista"}
                onClick={() => setViewMode((v) => (v === "list" ? "grid" : "list"))}
              >
                {viewMode === "list" ? <LayoutGrid className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Chips de filtros activos */}
          {(selectedTags.length > 0 || filterStatuses.length > 0) && (
            <div className="flex flex-wrap gap-2 px-1">
              {filterStatuses.map(st => (
                <Badge key={st} variant="secondary" className="rounded-full font-normal">
                  {getStatusText(st)}
                  <button className="ml-1 rounded-full" onClick={() => toggleStatusFilter(st)}>
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </Badge>
              ))}
              {selectedTags.map(tag => (
                <Badge key={tag} variant="secondary" className="rounded-full font-normal">
                  {tag}
                  <button className="ml-1 rounded-full" onClick={() => toggleTag(tag)}>
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Empty state */}
          {orders.length === 0 ? (
            <div className="rounded-3xl border border-border bg-card p-12 flex flex-col items-center justify-center text-center shadow-sm">
              <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">No hay pedidos aún</h3>
              <p className="text-sm text-muted-foreground">Los pedidos de tus clientes aparecerán aquí automáticamente.</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-10">
              <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No hay pedidos con los filtros seleccionados.</p>
            </div>
          ) : (
            <div className={cn(
              viewMode === "grid"
                ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
                : "grid grid-cols-1 gap-4"
            )}>
              <AnimatePresence mode="popLayout">
              {filteredOrders.map((order, index) => viewMode === "grid" ? (
                /* ── Vista tarjeta vertical ── */
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ x: 340, opacity: 0, scale: 0.9, transition: { duration: 0.32, ease: "easeIn" } }}
                  transition={{ duration: 0.28, delay: Math.min(index * 0.03, 0.3), ease: "easeOut" }}
                  onClick={() => (deletingId === order.id ? undefined : openDetail(order))}
                  className={cn(
                    "relative rounded-3xl p-4 shadow-sm border transition-[background-color,border-color,box-shadow] duration-500 hover:shadow-md cursor-pointer flex flex-col gap-3",
                    getCardStyle(order.status)
                  )}
                >
                  {renderDeleteOverlay(order.id)}
                  {renderStatusFlash(order)}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-base font-bold dark:text-white">#{order.id.slice(0, 8).toUpperCase()}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${getStatusBadgeClass(order.status)}`}>
                      {getStatusText(order.status).toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 rounded-2xl bg-white dark:bg-slate-900 p-3">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Detalle</span>
                    <div className="mt-1 space-y-0.5">
                      {Array.isArray(order.items) && order.items.length > 0 ? (
                        <>
                          {order.items.slice(0, 4).map((item: any, i: number) => (
                            <p key={i} className="text-sm font-semibold text-foreground truncate">
                              {item.quantity}x {item.name || item.product_name || `Producto ${i + 1}`}
                            </p>
                          ))}
                          {order.items.length > 4 && (
                            <p className="text-xs text-muted-foreground">+{order.items.length - 4} más</p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Sin detalle</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 text-sm font-medium">
                      {getPlatformIcon(order.conversation?.platform)}
                      <span className="truncate">{getOrderClientName(order) || 'Cliente Anónimo'}</span>
                    </div>
                    <span className="font-bold whitespace-nowrap">${order.total_amount}</span>
                  </div>

                  {order.tags && order.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {order.tags.map((tag, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 text-[10px] font-medium dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-black/10 dark:border-white/10 pt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                    {order.status !== 'completed' && order.status !== 'cancelled' && (
                      <Button
                        onClick={() => openCheckout(order)}
                        className="w-full h-9 rounded-xl bg-emerald-500 text-white font-bold text-xs shadow-sm hover:bg-emerald-600 transition-colors gap-1"
                      >
                        <Banknote className="h-4 w-4" /> Cobrar
                      </Button>
                    )}
                    <div className="flex items-center gap-2">
                    {nextStatusOf(order.status) && (
                      <Button
                        onClick={() => advanceOrderStatus(order)}
                        className="flex-1 h-9 rounded-xl bg-[#1f2030] text-[#d8ff55] font-bold text-xs shadow-sm hover:bg-[#2a2b3d] transition-colors whitespace-nowrap gap-1"
                      >
                        {getStatusText(nextStatusOf(order.status)!)}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-9 w-9 p-0 rounded-xl">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDetail(order)}>
                          <Edit className="mr-2 h-4 w-4" /> Ver / Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteOrder(order.id)} className="text-red-600">
                          <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ x: 340, opacity: 0, scale: 0.95, transition: { duration: 0.32, ease: "easeIn" } }}
                  transition={{ duration: 0.28, delay: Math.min(index * 0.03, 0.3), ease: "easeOut" }}
                  onClick={() => (deletingId === order.id ? undefined : openDetail(order))}
                  className={cn(
                    "relative rounded-3xl p-5 shadow-sm border transition-[background-color,border-color,box-shadow] duration-500 hover:shadow-md cursor-pointer",
                    getCardStyle(order.status)
                  )}
                >
                  {renderDeleteOverlay(order.id)}
                  {renderStatusFlash(order)}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    {/* Left: ID, status, time */}
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      {/* Product image or placeholder */}
                      <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {Array.isArray(order.items) && order.items[0]?.image_url ? (
                          <img src={order.items[0].image_url} alt="producto" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        ) : (
                          <ShoppingCart className="h-7 w-7 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg font-bold dark:text-white">#{order.id.slice(0, 8).toUpperCase()}</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadgeClass(order.status)}`}>
                            {getStatusText(order.status).toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: es })}
                        </p>
                      </div>
                    </div>

                    {/* Center: Products */}
                    <div className="flex-1 min-w-[180px] flex flex-col justify-center px-4 md:px-6 md:border-x border-black/10 dark:border-white/10">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Detalle de Productos</span>
                      {Array.isArray(order.items) && order.items.length > 0 ? (
                        order.items.map((item: any, i: number) => (
                          <p key={i} className="text-sm font-semibold text-foreground">
                            {item.quantity}x {item.name || item.product_name || `Producto ${i + 1}`}
                            <span className="text-xs text-muted-foreground font-normal ml-1">${item.price} c/u</span>
                          </p>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">Sin detalle</p>
                      )}
                    </div>

                    {/* Center-right: Client & Payment */}
                    <div className="flex-1 min-w-[180px] flex flex-col justify-center px-4 md:px-6 md:border-r border-black/10 dark:border-white/10">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Cliente & Pago</span>
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1">
                        {getPlatformIcon(order.conversation?.platform)}
                        <span>{getOrderClientName(order) || 'Cliente Anónimo'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CreditCard className="h-3.5 w-3.5" />
                        <span>{getOrderModalityLabel(order)} · ${order.total_amount}</span>
                      </div>
                      {order.tags && order.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {order.tags.map((tag, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 text-[10px] font-medium dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 ml-auto" onClick={(e) => e.stopPropagation()}>
                      {order.status !== 'completed' && order.status !== 'cancelled' && (
                        <Button
                          onClick={() => openCheckout(order)}
                          className="rounded-xl gap-1 bg-emerald-500 text-white font-bold hover:bg-emerald-600 whitespace-nowrap"
                        >
                          <Banknote className="h-4 w-4" /> Cobrar
                        </Button>
                      )}
                      {nextStatusOf(order.status) && (
                        <Button
                          onClick={() => advanceOrderStatus(order)}
                          className="px-4 py-2.5 rounded-xl bg-[#1f2030] text-[#d8ff55] font-bold text-sm shadow-sm hover:bg-[#2a2b3d] transition-colors whitespace-nowrap gap-1"
                        >
                          {getStatusText(nextStatusOf(order.status)!)}
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      )}

                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-9 w-9 p-0 rounded-xl">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openDetail(order)}>
                            <Edit className="mr-2 h-4 w-4" /> Ver / Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteOrder(order.id)} className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </motion.div>
              ))}
              </AnimatePresence>
            </div>
          )}

          {pagination && orders.length > 0 && (
            <div className="pt-2">
              <DashboardPagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                itemsPerPage={pagination.limit}
                entityName={{ singular: "pedido", plural: "pedidos" }}
              />
            </div>
          )}
        </TabsContent>

        {/* ─── PRODUCTS TAB ─── */}
        <TabsContent value="products" className="flex-1 overflow-y-auto space-y-4 pr-1 mt-0">
          <div className="flex items-center justify-between px-1 gap-2 flex-wrap">
            <h3 className="text-xl font-bold dark:text-white">Catálogo de Productos</h3>
            <div className="flex items-center gap-2">
              <ProductOptionsManager userId={userId} products={products.map((p) => ({ id: p.id, name: p.name }))} />
              <ProductImportWizard onImported={refreshProducts} />
              <ProductForm onProductCreated={refreshProducts} existingCategories={categories} />
            </div>
          </div>

          {/* Categorías: mismo carrusel de chips del punto de venta */}
          {categories.length > 0 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-2 hide-scrollbar-mobile">
              {["Todos", ...categories].map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setProductTabCategory(category)}
                  className={cn(
                    "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors shadow-[0_4px_12px_-3px_rgba(17,24,39,0.4)] dark:shadow-[0_4px_12px_-3px_rgba(0,0,0,0.7)] active:scale-95",
                    productTabCategory === category
                      ? "bg-[#1f2030] text-[#d8ff55]"
                      : "bg-white dark:bg-muted text-slate-400 hover:text-slate-700 dark:hover:text-foreground"
                  )}
                >
                  {category}
                </button>
              ))}
            </div>
          )}

          {!products || products.length === 0 ? (
            <div className="rounded-3xl border border-border bg-card p-12 flex flex-col items-center justify-center text-center shadow-sm">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">No hay productos en tu catálogo</h3>
              <p className="text-sm text-muted-foreground">Agrega productos para que tus clientes puedan hacer pedidos.</p>
            </div>
          ) : productsTabFiltered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card p-10 flex flex-col items-center justify-center text-center">
              <Search className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-base font-semibold mb-1">
                {productTabSearch.trim()
                  ? <>Sin resultados para &quot;{productTabSearch.trim()}&quot;</>
                  : <>Sin productos en &quot;{productTabCategory}&quot;</>}
              </h3>
              <p className="text-sm text-muted-foreground">Probá con otro nombre, descripción o categoría.</p>
            </div>
          ) : (
            /* En móvil: mismo grid compacto del punto de venta; en desktop: tarjetas grandes */
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 md:grid-cols-2 lg:grid-cols-3 md:gap-4">
              {productsTabFiltered.map((product) => (
                <div key={product.id} className="bg-card rounded-[2rem] md:rounded-3xl border border-border shadow-sm overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md p-3 md:p-0">
                  {/* Imagen: cuadrada estilo POS en móvil, banner en desktop */}
                  <div className="relative mb-2 md:mb-0 overflow-hidden rounded-[1.5rem] md:rounded-none bg-muted">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} loading="lazy" decoding="async" className="w-full aspect-square md:aspect-auto md:h-40 object-cover" />
                    ) : (
                      <div className="flex w-full aspect-square md:aspect-auto md:h-40 items-center justify-center bg-gradient-to-br from-muted to-muted/60">
                        <span className="select-none text-4xl font-black text-muted-foreground/30 md:hidden">{product.name.charAt(0).toUpperCase()}</span>
                        <Package className="hidden md:block h-10 w-10 text-muted-foreground" />
                      </div>
                    )}
                    {/* Acciones sobre la imagen (solo móvil) */}
                    <div className="absolute right-2 top-2 flex gap-1 md:hidden">
                      <button
                        type="button"
                        onClick={() => setEditingProduct(product)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-background/85 text-foreground shadow backdrop-blur-sm active:scale-90 transition-transform"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProduct(product.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-background/85 text-red-500 shadow backdrop-blur-sm active:scale-90 transition-transform"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {!product.is_available && (
                      <span className="absolute left-2 bottom-2 rounded-full bg-background/85 px-2 py-0.5 text-[9px] font-bold uppercase text-muted-foreground md:hidden">
                        No disponible
                      </span>
                    )}
                  </div>
                  <div className="md:p-5">
                    <div className="flex justify-between items-start md:mb-2">
                      <div className="flex-1 min-w-0">
                        {product.category && (
                          <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">
                            {product.category}
                          </span>
                        )}
                        <h4 className="font-bold text-sm md:text-base dark:text-white line-clamp-2 md:line-clamp-none leading-tight">{product.name}</h4>
                        {product.category && (
                          <span className="hidden md:inline-block text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium mt-1">
                            {product.category}
                          </span>
                        )}
                      </div>
                      <div className="hidden md:flex gap-1 ml-2">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-xl" onClick={() => setEditingProduct(product)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-xl text-red-500 hover:text-red-600" onClick={() => deleteProduct(product.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {product.description && (
                      <p className="hidden md:block text-xs text-muted-foreground mb-3 line-clamp-2">{product.description}</p>
                    )}
                    <div className="flex justify-between items-center pt-1 md:pt-0">
                      <span className="text-lg md:text-2xl font-black md:font-bold dark:text-white">${product.price}</span>
                      <span className={`hidden md:inline-block text-xs font-bold px-2.5 py-1 rounded-full ${product.is_available ? 'bg-[#D1F366] text-[#1C1C28]' : 'bg-muted text-muted-foreground'}`}>
                        {product.is_available ? 'Disponible' : 'No disponible'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── SETTINGS TAB ─── */}
        <TabsContent value="settings" className="flex-1 overflow-y-auto space-y-4 pr-1 mt-0">
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="text-xl font-bold dark:text-white">Configuración de Modalidades</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Configura las opciones de entrega disponibles para tus clientes.</p>
            </div>
            <Button
              onClick={saveDeliverySettings}
              disabled={isLoading}
              className="rounded-full bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C] shadow-sm"
            >
              {isLoading ? "Guardando..." : "Guardar Configuración"}
            </Button>
          </div>

          <div className="grid gap-4">
            {/* Modalidades */}
            <div className="bg-card rounded-3xl border border-border p-6 shadow-sm">
              <h4 className="font-bold text-base mb-1 dark:text-white">Modalidades Disponibles</h4>
              <p className="text-sm text-muted-foreground mb-4">Selecciona qué modalidades de entrega quieres ofrecer.</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="pickup"
                    checked={deliverySettings.pickup_enabled}
                    onCheckedChange={(c) => setDeliverySettings(p => ({ ...p, pickup_enabled: !!c }))}
                  />
                  <Label htmlFor="pickup" className="font-medium cursor-pointer">Retiro en local</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="delivery"
                    checked={deliverySettings.delivery_enabled}
                    onCheckedChange={(c) => setDeliverySettings(p => ({ ...p, delivery_enabled: !!c }))}
                  />
                  <Label htmlFor="delivery" className="font-medium cursor-pointer">Envío a domicilio</Label>
                </div>
              </div>
            </div>

            {/* Delivery config */}
            {deliverySettings.delivery_enabled && (
              <div className="bg-card rounded-3xl border border-border p-6 shadow-sm">
                <h4 className="font-bold text-base mb-4 dark:text-white">Configuración de Delivery</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="delivery_fee">Costo de delivery ($)</Label>
                    <NumberInput id="delivery_fee" value={deliverySettings.delivery_fee || null} className="rounded-xl"
                      onValueChange={(v) => setDeliverySettings(p => ({ ...p, delivery_fee: v ?? 0 }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minimum_order">Pedido mínimo ($)</Label>
                    <NumberInput id="minimum_order" value={deliverySettings.minimum_order_delivery || null} className="rounded-xl"
                      onValueChange={(v) => setDeliverySettings(p => ({ ...p, minimum_order_delivery: v ?? 0 }))} />
                  </div>
                </div>
              </div>
            )}

            {/* Instrucciones */}
            <div className="bg-card rounded-3xl border border-border p-6 shadow-sm">
              <h4 className="font-bold text-base mb-1 dark:text-white">Instrucciones Personalizadas</h4>
              <p className="text-sm text-muted-foreground mb-4">Mensajes que el bot enviará para cada modalidad.</p>
              <div className="space-y-4">
                {deliverySettings.pickup_enabled && (
                  <div className="space-y-2">
                    <Label htmlFor="pickup_instructions">Mensaje para retiro en local</Label>
                    <Textarea id="pickup_instructions" value={deliverySettings.pickup_instructions} className="rounded-xl"
                      placeholder="Ej: Te esperamos en nuestro local en..."
                      onChange={(e) => setDeliverySettings(p => ({ ...p, pickup_instructions: e.target.value }))} />
                  </div>
                )}
                {deliverySettings.delivery_enabled && (
                  <div className="space-y-2">
                    <Label htmlFor="delivery_instructions">Mensaje para delivery</Label>
                    <Textarea id="delivery_instructions" value={deliverySettings.delivery_instructions} className="rounded-xl"
                      placeholder="Ej: Realizamos delivery en la zona..."
                      onChange={(e) => setDeliverySettings(p => ({ ...p, delivery_instructions: e.target.value }))} />
                  </div>
                )}
              </div>
            </div>

            {/* Tiempos */}
            <div className="bg-card rounded-3xl border border-border p-6 shadow-sm">
              <h4 className="font-bold text-base mb-4 dark:text-white">Tiempos Estimados</h4>
              <div className="space-y-4">
                {deliverySettings.pickup_enabled && (
                  <div className="space-y-2">
                    <Label htmlFor="pickup_time">Tiempo estimado para retiro</Label>
                    <Input id="pickup_time" value={deliverySettings.pickup_time_estimate} className="rounded-xl" placeholder="Ej: 15-20 minutos"
                      onChange={(e) => setDeliverySettings(p => ({ ...p, pickup_time_estimate: e.target.value }))} />
                  </div>
                )}
                {deliverySettings.delivery_enabled && (
                  <div className="space-y-2">
                    <Label htmlFor="delivery_time">Tiempo estimado para delivery</Label>
                    <Input id="delivery_time" value={deliverySettings.delivery_time_estimate} className="rounded-xl" placeholder="Ej: 30-45 minutos"
                      onChange={(e) => setDeliverySettings(p => ({ ...p, delivery_time_estimate: e.target.value }))} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Product Dialog */}
      {editingProduct && (
        <ProductEditForm
          product={editingProduct}
          onProductUpdated={refreshProducts}
          onClose={() => setEditingProduct(null)}
          existingCategories={categories}
          isOpen={!!editingProduct}
        />
      )}

      {/* Vista previa / edición del pedido */}
      <Dialog open={isDetailOpen} onOpenChange={(o) => { setIsDetailOpen(o); if (!o) { setDetailMode("edit"); setPrintPhase(null) } }}>
        <DialogContent className="max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col rounded-2xl p-4 sm:p-6 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-full max-sm:rounded-t-3xl max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:max-h-[93dvh] max-sm:data-[state=open]:slide-in-from-bottom-10 max-sm:data-[state=closed]:slide-out-to-bottom-10">
          <SheetGrabBar onDismiss={() => { setIsDetailOpen(false); setDetailMode("edit"); setPrintPhase(null) }} />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailMode === "checkout" && <Banknote className="h-5 w-5 text-emerald-600" />}
              Pedido #{selectedOrder?.id.slice(0, 8).toUpperCase()}
              {selectedOrder && (
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadgeClass(editStatus)}`}>
                  {getStatusText(editStatus).toUpperCase()}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {detailMode === "checkout"
                ? "Elegí el método de pago para finalizar la venta."
                : detailMode === "print"
                  ? "Así se va a ver el ticket impreso."
                  : "Revisá, editá los productos y actualizá el estado del pedido."}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden md:grid md:grid-cols-2">
              {/* ── Columna izquierda: info del pedido (durante el cobro se oculta en móvil) ── */}
              <div className={cn("space-y-4 md:h-full md:overflow-y-auto md:pr-5", detailMode !== "edit" && "hidden md:block")}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Cliente</Label>
                    <p className="font-medium">{getOrderClientName(selectedOrder) || "Cliente Anónimo"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Teléfono</Label>
                    <p className="font-medium">{selectedOrder.delivery_phone && selectedOrder.delivery_phone !== "venta-local" ? selectedOrder.delivery_phone : "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Modalidad</Label>
                    <p className="font-medium">{getOrderModalityLabel(selectedOrder)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Plataforma</Label>
                    <p className="font-medium capitalize">{selectedOrder.conversation?.platform || "Local"}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Estado</Label>
                  <Select
                    value={editStatus}
                    onValueChange={(v) => {
                      // Finalizar exige cobro: en vez de marcar completado, abrimos el cobro.
                      if (v === "completed") { setDetailMode("checkout"); return }
                      setEditStatus(v)
                    }}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="confirmed">Confirmado</SelectItem>
                      <SelectItem value="preparing">Preparando</SelectItem>
                      <SelectItem value="ready">Listo</SelectItem>
                      <SelectItem value="delivered">Entregado</SelectItem>
                      <SelectItem value="completed">Finalizado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="delivery_address">Dirección de entrega</Label>
                  <Input id="delivery_address" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Dirección completa" className="rounded-xl" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer_notes">Notas</Label>
                  <Textarea id="customer_notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notas adicionales..." className="rounded-xl" rows={3} />
                </div>
              </div>

              {/* ── Columna derecha: productos ⇄ cobro (se intercambian con animación) ── */}
              <div className="mt-5 md:mt-0 flex flex-col min-h-0 md:h-full md:border-l md:border-border md:pl-5">
                <AnimatePresence mode="wait" initial={false}>
                {detailMode === "checkout" ? (
                  <motion.div
                    key="checkout"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="md:overflow-y-auto md:pr-1"
                  >
                    {ticketTip > 0 && (
                      <div className="mb-3 rounded-2xl border border-border bg-muted/30 p-3 text-sm">
                        <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(editTotal)}</span></div>
                        <div className="flex justify-between text-muted-foreground"><span>Propina sugerida {posTipPercent}%</span><span>+{formatCurrency(ticketTip)}</span></div>
                        <div className="mt-1 flex justify-between border-t border-border pt-1 font-bold"><span>Total a cobrar</span><span>{formatCurrency(editTotal + ticketTip)}</span></div>
                      </div>
                    )}
                    <OrderCheckoutPanel
                      total={editTotal + ticketTip}
                      items={editItems}
                      showItems={false}
                      initialPayments={selectedOrder.payments}
                      onFinalize={finalizeFromModal}
                      onPaymentsChange={savePartialPayments}
                    />
                  </motion.div>
                ) : detailMode === "print" ? (
                  <motion.div
                    key="print"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="flex flex-col min-h-0 md:flex-1"
                  >
                    {printPhase ? (
                      /* Animación de panel completo: imprimiendo → impreso */
                      <motion.div
                        key={printPhase}
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className={cn(
                          "flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl py-16 text-white shadow-lg",
                          printPhase === "printing" ? "bg-[#1f2030]" : "bg-emerald-500"
                        )}
                      >
                        {printPhase === "printing" ? (
                          <>
                            <div className="flex flex-col items-center">
                              <Printer className="h-16 w-16 text-[#d8ff55]" />
                              {/* Ticket saliendo de la impresora */}
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
                                  <div className="h-1 w-1/2 rounded bg-neutral-200" />
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
                            <motion.p
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.3 }}
                              className="text-lg font-black tracking-wide"
                            >
                              ¡Ticket impreso!
                            </motion.p>
                            <motion.button
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.6 }}
                              type="button"
                              onClick={() => setPrintPhase(null)}
                              className="mt-1 rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold text-white hover:bg-white/25 transition-colors"
                            >
                              Ver vista previa
                            </motion.button>
                          </>
                        )}
                      </motion.div>
                    ) : (
                    <>
                    {/* Vista previa del ticket */}
                    <div className="md:flex-1 md:min-h-0 md:overflow-y-auto flex justify-center py-1">
                      <div className="flex w-full flex-col items-center">
                        <motion.div
                          className={cn("w-full rounded-lg bg-white text-black shadow-lg border border-border/50 px-4 py-5 font-mono text-[12px] leading-snug h-fit", ticketWidth === 58 ? "max-w-[210px]" : "max-w-[280px]")}
                        >
                          <p className="text-center text-[14px] font-bold uppercase">{businessName}</p>
                        <p className="text-center text-[10px] text-neutral-500">
                          {format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })} · se imprime con la hora exacta
                        </p>
                        <div className="my-2 border-t border-dashed border-neutral-400" />
                        <div className="flex justify-between"><span>Pedido</span><span>#{selectedOrder.id.slice(0, 8).toUpperCase()}</span></div>
                        {getOrderClientName(selectedOrder) && (
                          <div className="flex justify-between gap-2"><span>Cliente</span><span className="truncate">{getOrderClientName(selectedOrder)}</span></div>
                        )}
                        <div className="flex justify-between gap-2"><span>Modalidad</span><span>{getOrderModalityLabel(selectedOrder)}</span></div>
                        <div className="my-2 border-t border-dashed border-neutral-400" />
                        {editItems.map((item, i) => (
                          <div key={i} className="flex justify-between gap-2">
                            <span className="min-w-0 break-words">
                              {item.quantity}x {item.name}
                              {optionNames(item.options).length > 0 && (
                                <span className="block pl-3 text-[10px] text-neutral-500">{optionNames(item.options).join(", ")}</span>
                              )}
                            </span>
                            <span className="shrink-0">{formatCurrency(item.price * item.quantity)}</span>
                          </div>
                        ))}
                        {ticketTip > 0 && (
                          <>
                            <div className="my-2 border-t border-dashed border-neutral-400" />
                            <div className="flex justify-between gap-2"><span>Subtotal</span><span>{formatCurrency(editTotal)}</span></div>
                            <div className="flex justify-between gap-2"><span>Propina / extra</span><span>+{formatCurrency(ticketTip)}</span></div>
                          </>
                        )}
                        <div className="my-2 border-t border-dashed border-neutral-400" />
                        <div className="flex justify-between text-[14px] font-bold"><span>TOTAL</span><span>{formatCurrency(editTotal + ticketTip)}</span></div>
                        {selectedOrder.payments && selectedOrder.payments.length > 0 &&
                          !(selectedOrder.payments.length === 1 && Math.abs(selectedOrder.payments[0].amount - (editTotal + ticketTip)) < 0.01) && (
                          <>
                            <div className="my-2 border-t border-dashed border-neutral-400" />
                            {selectedOrder.payments.map((p, i) => (
                              <div key={i} className="flex justify-between text-[11px]"><span>{p.label || p.method}</span><span>{formatCurrency(p.amount)}</span></div>
                            ))}
                          </>
                        )}
                        {cleanTicketNotes(editNotes) && <p className="mt-2 text-[10px] text-neutral-600 break-words">Nota: {cleanTicketNotes(editNotes)}</p>}
                        <p className="mt-3 text-center text-[10px] text-neutral-500">¡Gracias por su compra!</p>
                        <p className="text-center text-[10px] text-neutral-500">No válido como factura</p>
                        <p className="mt-1 text-center text-[9px] font-bold text-neutral-500">UCOBOT - CODEA DESARROLLOS</p>
                        </motion.div>
                      </div>
                    </div>
                    <Button
                      onClick={handlePrintTicket}
                      className="mt-3 h-11 w-full shrink-0 rounded-xl bg-[#1f2030] text-[#d8ff55] font-bold hover:bg-[#2a2b3d] gap-2"
                    >
                      <Printer className="h-4 w-4" /> Imprimir ticket
                    </Button>
                    </>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="products"
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="relative flex flex-col min-h-0 md:flex-1"
                  >
                <div className="flex items-center justify-between shrink-0">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Productos</Label>
                  <Button
                    type="button"
                    variant={showAddProduct ? "secondary" : "outline"}
                    size="sm"
                    className="rounded-xl gap-1 h-8 transition-all active:scale-95"
                    onClick={() => (showAddProduct ? closeAddDropdown() : setShowAddProduct(true))}
                  >
                    <motion.span animate={{ rotate: showAddProduct ? 45 : 0 }} transition={{ duration: 0.18 }} className="flex">
                      <Plus className="h-3.5 w-3.5" />
                    </motion.span>
                    {showAddProduct ? "Cerrar" : "Agregar"}
                  </Button>
                </div>

                {/* Dropdown flotante para agregar productos: flota SOBRE la lista, no la empuja */}
                <AnimatePresence>
                {showAddProduct && (
                  <>
                    {/* Click-afuera para cerrar */}
                    <motion.div
                      key="add-backdrop"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 z-10 rounded-2xl bg-background/50 backdrop-blur-[2px] max-sm:fixed max-sm:z-[55] max-sm:rounded-none max-sm:bg-background/60"
                      onClick={closeAddDropdown}
                    />
                    <motion.div
                      key="add-panel"
                      initial={{ opacity: 0, y: -10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                      style={{ transformOrigin: "top right" }}
                      // En móvil flota centrado-arriba en la pantalla (el dropdown pegado abajo quedaba tapado por el teclado)
                      className="absolute left-0 right-0 top-10 z-20 rounded-2xl border border-border bg-popover p-2 space-y-2 shadow-2xl max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:top-[10vh] max-sm:z-[60]"
                    >
                      {addConfirmPhase ? (
                        /* Confirmación: check animado dentro del dropdown */
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.2 }}
                          className="flex flex-col items-center justify-center gap-2 rounded-xl bg-emerald-500 py-10 text-white"
                        >
                          <motion.div
                            initial={{ scale: 0, rotate: -30 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 280, damping: 14, delay: 0.08 }}
                            className="relative"
                          >
                            <span className="absolute inset-0 rounded-full bg-white/25 animate-ping" />
                            <CheckCircle2 className="relative h-14 w-14" />
                          </motion.div>
                          <motion.p
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.25 }}
                            className="text-sm font-black tracking-wide"
                          >
                            ¡Agregados al pedido!
                          </motion.p>
                        </motion.div>
                      ) : (
                      <>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="Buscar producto..." className="h-9 pl-8 rounded-xl" autoFocus />
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {addMatches.slice(0, 20).map((p, i) => {
                          const stagedQty = staged.find((s) => s.id === p.id)?.qty || 0
                          return (
                          <motion.button
                            key={p.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.025, 0.25), duration: 0.18 }}
                            type="button"
                            onClick={() => stageProduct(p)}
                            className={cn(
                              "relative flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-all hover:bg-muted active:scale-[0.98]",
                              (justAddedRow?.id === p.id || stagedQty > 0) && "bg-[#D1F366]/15 ring-1 ring-[#D1F366]/70"
                            )}
                          >
                            {/* "+1" al sumar a la selección */}
                            <AnimatePresence>
                              {justAddedRow?.id === p.id && (
                                <motion.span
                                  key={justAddedRow.nonce}
                                  initial={{ opacity: 0, scale: 0.4, y: 8 }}
                                  animate={{ opacity: 1, scale: 1.1, y: -2 }}
                                  exit={{ opacity: 0, scale: 0.8, y: -12 }}
                                  transition={{ duration: 0.35, ease: "easeOut" }}
                                  className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 z-10 rounded-full bg-[#D1F366] px-2 py-0.5 text-xs font-black text-[#1C1C28] shadow-lg"
                                >
                                  +1
                                </motion.span>
                              )}
                            </AnimatePresence>
                            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                              ) : (
                                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                            <span className="text-xs font-semibold text-muted-foreground">{formatCurrency(Number(p.price) || 0)}</span>
                            {stagedQty > 0 ? (
                              <motion.span
                                key={stagedQty}
                                initial={{ scale: 1.4 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                                className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[#D1F366] px-1.5 text-xs font-black text-[#1C1C28]"
                              >
                                ×{stagedQty}
                              </motion.span>
                            ) : (
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                <Plus className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </motion.button>
                          )
                        })}
                        {addMatches.length === 0 && (
                          <p className="py-3 text-center text-xs text-muted-foreground">Sin resultados.</p>
                        )}
                      </div>

                      {/* Carrito de selección: lo que entra al pedido al confirmar */}
                      <AnimatePresence initial={false}>
                        {staged.length > 0 && (
                          <motion.div
                            key="staged-cart"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-border pt-2 space-y-1.5">
                              <div className="max-h-28 overflow-y-auto space-y-1 px-0.5">
                                <AnimatePresence initial={false}>
                                  {staged.map((s) => (
                                    <motion.div
                                      key={s.id}
                                      layout
                                      initial={{ opacity: 0, y: -6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95 }}
                                      transition={{ duration: 0.15 }}
                                      className="flex items-center gap-2 text-xs"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => unstageProduct(s.id)}
                                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70 transition-colors active:scale-90"
                                      >
                                        <Minus className="h-3 w-3" />
                                      </button>
                                      <span className="font-black text-[#5c7a16] dark:text-[#D1F366]">{s.qty}x</span>
                                      <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                                      <span className="shrink-0 font-semibold">{formatCurrency(s.price * s.qty)}</span>
                                    </motion.div>
                                  ))}
                                </AnimatePresence>
                              </div>
                              <Button
                                type="button"
                                onClick={confirmStaged}
                                className="h-10 w-full rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C] active:scale-[0.98] transition-all"
                              >
                                Agregar {stagedCount} al pedido · {formatCurrency(stagedTotal)}
                              </Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      </>
                      )}
                    </motion.div>
                  </>
                )}
                </AnimatePresence>

                {/* Lista de productos del pedido (estilo carrito) */}
                <div className="md:flex-1 md:min-h-0 md:overflow-y-auto space-y-2.5 pr-1 mt-2.5">
                  {editItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      El pedido no tiene productos. Agregá con el botón de arriba.
                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                    {editItems.map((item, index) => (
                      <motion.div
                        key={item.product_id ?? `custom-${item.name}`}
                        layout
                        initial={{ opacity: 0, y: -12, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="flex items-center gap-3 rounded-2xl bg-muted/40 p-3"
                      >
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted flex items-center justify-center">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                          ) : (
                            <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold leading-tight line-clamp-2">{item.name}</h4>
                          {optionNames(item.options).length > 0 && (
                            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{optionNames(item.options).join(" · ")}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(item.price)} / ud</p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <button type="button" onClick={() => updateItemQty(index, -1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-background text-muted-foreground hover:bg-muted transition-colors active:scale-90">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="min-w-4 text-center text-sm font-semibold">{item.quantity}</span>
                            <button type="button" onClick={() => updateItemQty(index, 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-background text-muted-foreground hover:bg-muted transition-colors active:scale-90">
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-col items-end justify-between self-stretch">
                          <button type="button" onClick={() => removeEditItem(index)} className="p-1 rounded-full hover:bg-background transition-colors">
                            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </button>
                          <p className="text-sm font-bold">{formatCurrency(item.price * item.quantity)}</p>
                        </div>
                      </motion.div>
                    ))}
                    </AnimatePresence>
                  )}
                </div>

                <div className="border-t border-border pt-3 mt-3 shrink-0 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Total</span>
                    <motion.span key={editTotal} initial={{ scale: 1.08 }} animate={{ scale: 1 }} className="text-xl font-black">
                      {formatCurrency(editTotal)}
                    </motion.span>
                  </div>
                  {orderIsPosOpen && posTipEnabled && ticketTip > 0 ? (
                    <p className="text-xs font-semibold text-muted-foreground text-right">+ Propina {posTipPercent}% ({formatCurrency(ticketTip)}) se agrega al cobrar</p>
                  ) : (selectedOrder.tip_amount || 0) > 0 ? (
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 text-right">Propina: {formatCurrency(selectedOrder.tip_amount!)}</p>
                  ) : null}
                  {selectedOrder.payments && selectedOrder.payments.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {selectedOrder.payments.map((p, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-background pl-2 pr-1 py-1 text-[10px] font-bold text-foreground shadow-sm">
                          {p.label || p.method}: pagó {formatCurrency(p.amount + (p.tip || 0))}
                          {p.tip ? <span className="font-medium text-muted-foreground">({formatCurrency(p.tip)} de propina)</span> : null}
                          <button
                            type="button"
                            title="Quitar este pago"
                            onClick={() => removePayment(i)}
                            className="rounded-full p-0.5 hover:bg-muted transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-border pt-3 mt-1 gap-2 flex-col-reverse sm:flex-row sm:justify-between">
            {detailMode !== "edit" ? (
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl w-full sm:w-auto"
                onClick={() => { setDetailMode("edit"); setPrintPhase(null) }}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Volver al pedido
              </Button>
            ) : (
              <div className={cn(
                "grid gap-2 w-full sm:flex sm:w-auto sm:items-center",
                selectedOrder && selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' ? "grid-cols-2" : "grid-cols-1"
              )}>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl gap-1 w-full sm:w-auto"
                  onClick={() => setDetailMode("print")}
                >
                  <Printer className="h-4 w-4" /> Imprimir
                </Button>
                {selectedOrder && selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl gap-1 border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 w-full sm:w-auto"
                    onClick={() => setDetailMode("checkout")}
                  >
                    <Banknote className="h-4 w-4" /> Cobrar
                  </Button>
                )}
              </div>
            )}
            {detailMode === "edit" && (
              <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center">
                <Button type="button" variant="outline" className="rounded-xl w-full sm:w-auto" onClick={() => setIsDetailOpen(false)}>Cancelar</Button>
                <Button type="button" disabled={isLoading} onClick={handleSaveOrder} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C] w-full sm:w-auto">
                  {isLoading ? "Guardando..." : "Guardar cambios"}
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de cobro (cerrar la venta) */}
      <OrderCheckoutDialog
        order={checkoutOrder}
        open={!!checkoutOrder}
        onOpenChange={(o) => { if (!o) setCheckoutOrder(null) }}
        onFinalized={handleOrderFinalized}
        tipEnabled={posTipEnabled}
        tipPercent={posTipPercent}
      />
    </div>
  )
}