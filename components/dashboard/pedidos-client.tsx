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
import { ShoppingCart, Package, Edit, Trash2, Settings, MoreHorizontal, Filter, X, Search, MessageCircle, Camera, CreditCard, Building2, Banknote, Plus, Minus, ChevronRight, ChevronLeft, ShoppingBag, LayoutGrid, LayoutList, Tag, Printer } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDistanceToNow, format } from "date-fns"
import { es } from "date-fns/locale"
import { ProductForm } from "./product-form"
import { ProductImportWizard } from "./product-import-wizard"
import { ProductEditForm } from "./product-edit-form"
import { OrderCheckoutDialog, OrderCheckoutPanel, type PaymentRecord } from "./order-checkout-dialog"
import { printTicket } from "@/lib/print-ticket"
import { toast } from "sonner"
import { DashboardPagination } from "./dashboard-pagination"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { gsap } from "gsap"
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
  initialOrders: Order[]
  initialProducts: Product[]
  initialCategories: string[]
  deliverySettings?: DeliverySettings
  businessName?: string
  pagination?: {
    page: number
    limit: number
    totalItems: number
    totalPages: number
  }
}

export function PedidosClient({
  initialOrders,
  initialProducts,
  initialCategories,
  deliverySettings: initialDeliverySettings,
  businessName = "Mi Negocio",
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
  // Estado editable del pedido en la vista previa
  const [editItems, setEditItems] = useState<{ product_id: string | null; name: string; price: number; quantity: number; image_url: string | null }[]>([])
  const [editStatus, setEditStatus] = useState("pending")
  const [editAddress, setEditAddress] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [addSearch, setAddSearch] = useState("")
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [checkoutOrder, setCheckoutOrder] = useState<Order | null>(null)
  // Modo del modal de detalle: edición, cobro o vista previa de impresión (se intercambian con animación)
  const [detailMode, setDetailMode] = useState<"edit" | "checkout" | "print">("edit")
  const [orderSearch, setOrderSearch] = useState("")
  const supabase = createClient()
  const router = useRouter()

  // Extract unique tags from all orders
  const allTags = Array.from(new Set(orders.flatMap(o => o.tags || []))).sort()

  const pendingCardsRef = useRef<(HTMLDivElement | null)[]>([])

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

  useEffect(() => {
    // GSAP animation for pending orders
    const pendingElements = pendingCardsRef.current.filter(Boolean)
    if (pendingElements.length > 0) {
      const ctx = gsap.context(() => {
        gsap.to(pendingElements, {
          y: -4,
          boxShadow: "0 10px 15px -3px rgba(209, 243, 102, 0.4)",
          repeat: -1,
          yoyo: true,
          duration: 1.5,
          ease: "sine.inOut",
          stagger: {
            amount: 0.5,
            from: "start"
          }
        })
      })
      return () => ctx.revert()
    }
  }, [orders])

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

  const handleDeleteOrder = (orderId: string) => {
    toast("¿Estás seguro de eliminar este pedido?", {
      description: "Esta acción no se puede deshacer.",
      action: {
        label: "Eliminar",
        onClick: () => performDeleteOrder(orderId),
      },
    })
  }

  const performDeleteOrder = async (orderId: string) => {
    setIsLoading(true)
    try {
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderId)

      if (error) throw error

      setOrders(orders.filter(o => o.id !== orderId))
      toast.success("Pedido eliminado correctamente")
      router.refresh()
    } catch (error) {
      console.error("Error deleting order:", error)
      toast.error("No se pudo eliminar el pedido")
    } finally {
      setIsLoading(false)
    }
  }

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
    try {
      const { data, error } = await supabase
        .from("orders")
        .update({ status: next })
        .eq("id", order.id)
        .select()
        .single()
      if (error) throw error
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...data } : o)))
      toast.success(`Pedido marcado como ${getStatusText(next)}`)
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
      }))
    )
    setAddSearch("")
    setShowAddProduct(false)
    setDetailMode("edit")
    setIsDetailOpen(true)
  }

  const editTotal = editItems.reduce((sum, i) => sum + i.price * i.quantity, 0)

  const addProductToOrder = (p: Product) => {
    setEditItems((prev) => {
      const ex = prev.find((i) => i.product_id === p.id)
      if (ex) return prev.map((i) => (i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i))
      // Se agrega arriba para que el usuario lo vea entrar (animado)
      return [{ product_id: p.id, name: p.name, price: Number(p.price) || 0, quantity: 1, image_url: p.image_url || null }, ...prev]
    })
    // El panel queda abierto para seguir agregando; solo se limpia la búsqueda
    setAddSearch("")
  }

  // Productos que matchean el buscador del panel "Agregar" (sin acentos)
  const addMatches = products.filter((p) =>
    normalizeSearchText(`${p.name} ${p.category ?? ""}`).includes(normalizeSearchText(addSearch.trim()))
  )

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
      }))
      // Las propinas dejadas del vuelto se suman a la propina registrada del pedido
      const tipsFromPayments = payments.reduce((s, p) => s + (p.tip || 0), 0)
      const { data, error } = await supabase
        .from("orders")
        .update({
          status: "completed",
          items,
          total_amount: Number(editTotal.toFixed(2)),
          tip_amount: Number(((selectedOrder.tip_amount || 0) + tipsFromPayments).toFixed(2)),
          delivery_address: editAddress,
          customer_notes: editNotes,
          payments,
        })
        .eq("id", selectedOrder.id)
        .select()
        .single()
      if (error) throw error
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, ...data } : o)))
      toast.success("Venta finalizada")
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
    setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, payments } : o)))
  }

  // Imprime el ticket con lo que se ve en pantalla (items editados incluidos)
  const handlePrintTicket = () => {
    if (!selectedOrder) return
    printTicket({
      businessName,
      orderId: selectedOrder.id,
      clientName: getOrderClientName(selectedOrder),
      orderType: getOrderModalityLabel(selectedOrder),
      items: editItems.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
      total: editTotal,
      payments: selectedOrder.payments,
      notes: editNotes || undefined,
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

  const getCardStyle = (status: string) => {
    switch (status) {
      case 'pending':    return 'bg-[#fcffeb] dark:bg-[#D1F366]/10 border-[#D1F366] dark:border-[#D1F366]/40 order-card-pending'
      case 'completed':  return 'bg-slate-50 dark:bg-muted/30 opacity-70 grayscale-[30%] border-slate-200 dark:border-border'
      case 'cancelled':  return 'bg-slate-50 dark:bg-muted/20 opacity-60 grayscale-[50%] border-slate-200 dark:border-border text-slate-400 dark:text-muted-foreground line-through'
      case 'ready':      return 'bg-[#f4fcf6] dark:bg-[#1DB954]/10 border-[#1aa34a]/30 dark:border-[#1DB954]/40'
      default:           return 'bg-card border-border'
    }
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending':    return 'bg-[#D1F366] text-[#1C1C28] border border-[#B3D93C]'
      case 'confirmed':  return 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30'
      case 'preparing':  return 'bg-yellow-100 text-yellow-700 border border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30'
      case 'ready':      return 'bg-[#1DB954] text-white border border-[#1aa34a]'
      case 'completed':  return 'bg-slate-200 text-slate-500 border border-slate-300 dark:bg-muted dark:text-muted-foreground dark:border-border'
      case 'delivered':  return 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-muted dark:text-muted-foreground dark:border-border'
      case 'cancelled':  return 'bg-slate-100 text-slate-400 border border-slate-200 line-through dark:bg-muted/50 dark:text-muted-foreground dark:border-border'
      default:           return 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-muted dark:text-muted-foreground dark:border-border'
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <audio ref={audioRef} id="new-order-sound" src="/sounds/cash-register.mp3" preload="auto" />
      {/* Header */}
      <div className="flex justify-between items-center mb-6 px-1 pt-2">
        <div>
          <h2 className="text-3xl font-bold dark:text-white">Gestión de Pedidos</h2>
          <p className="text-muted-foreground text-sm mt-1">Administración de órdenes y ventas en tiempo real.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-[#B3D93C] transition-colors" />
            <input
              className="pl-10 pr-4 py-2.5 rounded-full border border-border bg-card shadow-sm focus:ring-2 focus:ring-[#D1F366] focus:outline-none w-48 xl:w-64 text-sm text-foreground placeholder-muted-foreground transition-all"
              placeholder="Buscar orden o cliente..."
              type="text"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="orders" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start rounded-2xl bg-muted p-1 mb-4 h-auto">
          <TabsTrigger value="orders" className="rounded-xl flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-5 py-2.5 font-semibold">
            <ShoppingCart className="h-4 w-4" />
            Pedidos
          </TabsTrigger>
          <TabsTrigger value="products" className="rounded-xl flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-5 py-2.5 font-semibold">
            <Package className="h-4 w-4" />
            Productos
          </TabsTrigger>
          <TabsTrigger value="settings" className="rounded-xl flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-5 py-2.5 font-semibold">
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
              {filteredOrders.map((order, index) => viewMode === "grid" ? (
                /* ── Vista tarjeta vertical ── */
                <div
                  key={order.id}
                  ref={(el) => {
                    if (order.status === 'pending') {
                      pendingCardsRef.current[index] = el
                    } else {
                      pendingCardsRef.current[index] = null
                    }
                  }}
                  onClick={() => openDetail(order)}
                  className={cn(
                    "rounded-3xl p-4 shadow-sm border transition-all hover:shadow-md cursor-pointer flex flex-col gap-3",
                    getCardStyle(order.status)
                  )}
                >
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

                  <div className="flex-1 rounded-2xl bg-background/50 dark:bg-muted/20 p-3">
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
                        <span key={i} className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-medium dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-border pt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
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
                        className="flex-1 h-9 rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold text-xs shadow-sm hover:bg-[#B3D93C] transition-colors whitespace-nowrap gap-1"
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
                </div>
              ) : (
                <div
                  key={order.id}
                  ref={(el) => {
                    if (order.status === 'pending') {
                      pendingCardsRef.current[index] = el
                    } else {
                      pendingCardsRef.current[index] = null
                    }
                  }}
                  onClick={() => openDetail(order)}
                  className={cn(
                    "rounded-3xl p-5 shadow-sm border transition-all hover:shadow-md cursor-pointer",
                    getCardStyle(order.status)
                  )}
                >
                  <div className={cn("flex flex-wrap items-center justify-between gap-4", order.status === "cancelled" && "opacity-60")}>
                    {/* Left: ID, status, time */}
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      {/* Product image or placeholder */}
                      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                        {Array.isArray(order.items) && order.items[0]?.image_url ? (
                          <img src={order.items[0].image_url} alt="producto" className="w-full h-full object-cover" />
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
                    <div className="flex-1 min-w-[180px] flex flex-col justify-center px-4 md:px-6 md:border-x border-border">
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
                    <div className="flex-1 min-w-[180px] flex flex-col justify-center px-4 md:px-6 md:border-r border-border">
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
                            <span key={i} className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-medium dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
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
                          variant="outline"
                          className="rounded-xl gap-1 border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 whitespace-nowrap"
                        >
                          <Banknote className="h-4 w-4" /> Cobrar
                        </Button>
                      )}
                      {nextStatusOf(order.status) && (
                        <Button
                          onClick={() => advanceOrderStatus(order)}
                          className="px-4 py-2.5 rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold text-sm shadow-sm hover:bg-[#B3D93C] transition-colors whitespace-nowrap gap-1"
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
                </div>
              ))}
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
              <ProductImportWizard onImported={refreshProducts} />
              <ProductForm onProductCreated={refreshProducts} existingCategories={categories} />
            </div>
          </div>

          {!products || products.length === 0 ? (
            <div className="rounded-3xl border border-border bg-card p-12 flex flex-col items-center justify-center text-center shadow-sm">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">No hay productos en tu catálogo</h3>
              <p className="text-sm text-muted-foreground">Agrega productos para que tus clientes puedan hacer pedidos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((product) => (
                <div key={product.id} className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 bg-muted flex items-center justify-center">
                      <Package className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h4 className="font-bold text-base dark:text-white">{product.name}</h4>
                        {product.category && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium mt-1 inline-block">
                            {product.category}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 ml-2">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-xl" onClick={() => setEditingProduct(product)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-xl text-red-500 hover:text-red-600" onClick={() => deleteProduct(product.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {product.description && (
                      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{product.description}</p>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-2xl font-bold dark:text-white">${product.price}</span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${product.is_available ? 'bg-[#D1F366] text-[#1C1C28]' : 'bg-muted text-muted-foreground'}`}>
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
      <Dialog open={isDetailOpen} onOpenChange={(o) => { setIsDetailOpen(o); if (!o) setDetailMode("edit") }}>
        <DialogContent className="max-w-4xl w-[calc(100vw-1rem)] sm:w-full max-h-[92vh] overflow-hidden flex flex-col rounded-2xl p-4 sm:p-6">
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
                  <Select value={editStatus} onValueChange={setEditStatus}>
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
                    <OrderCheckoutPanel
                      total={editTotal}
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
                    {/* Vista previa del ticket */}
                    <div className="md:flex-1 md:min-h-0 md:overflow-y-auto flex justify-center py-1">
                      <div className="w-full max-w-[280px] rounded-lg bg-white text-black shadow-lg border border-border/50 px-4 py-5 font-mono text-[12px] leading-snug h-fit">
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
                            <span className="min-w-0 break-words">{item.quantity}x {item.name}</span>
                            <span className="shrink-0">{formatCurrency(item.price * item.quantity)}</span>
                          </div>
                        ))}
                        <div className="my-2 border-t border-dashed border-neutral-400" />
                        <div className="flex justify-between text-[14px] font-bold"><span>TOTAL</span><span>{formatCurrency(editTotal)}</span></div>
                        {selectedOrder.payments && selectedOrder.payments.length > 0 && (
                          <>
                            <div className="my-2 border-t border-dashed border-neutral-400" />
                            {selectedOrder.payments.map((p, i) => (
                              <div key={i} className="flex justify-between text-[11px]"><span>{p.label || p.method}</span><span>{formatCurrency(p.amount)}</span></div>
                            ))}
                          </>
                        )}
                        {editNotes && <p className="mt-2 text-[10px] text-neutral-600 break-words">Nota: {editNotes}</p>}
                        <p className="mt-3 text-center text-[10px] text-neutral-500">¡Gracias por su compra!</p>
                        <p className="mt-1 text-center text-[9px] font-bold text-neutral-500">UCOBOT - CODEA DESARROLLOS</p>
                      </div>
                    </div>
                    <Button
                      onClick={handlePrintTicket}
                      className="mt-3 h-11 w-full shrink-0 rounded-xl bg-[#1f2030] text-[#d8ff55] font-bold hover:bg-[#2a2b3d] gap-2"
                    >
                      <Printer className="h-4 w-4" /> Imprimir ticket
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="products"
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="flex flex-col min-h-0 md:flex-1"
                  >
                <div className="flex items-center justify-between shrink-0">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Productos</Label>
                  <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1 h-8" onClick={() => setShowAddProduct((v) => !v)}>
                    {showAddProduct ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    {showAddProduct ? "Cerrar" : "Agregar"}
                  </Button>
                </div>

                {/* Buscador de productos para agregar (entra/sale con animación) */}
                <AnimatePresence initial={false}>
                {showAddProduct && (
                  <motion.div
                    key="add-panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="shrink-0 overflow-hidden"
                  >
                  <div className="mt-2.5 rounded-2xl border border-border bg-muted/30 p-2 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="Buscar producto..." className="h-9 pl-8 rounded-xl" autoFocus />
                    </div>
                    <div className="max-h-44 overflow-y-auto space-y-1">
                      {addMatches.slice(0, 20).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => addProductToOrder(p)}
                            className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-background active:scale-[0.99]"
                          >
                            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                              ) : (
                                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                            <span className="text-xs font-semibold text-muted-foreground">{formatCurrency(Number(p.price) || 0)}</span>
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#D1F366] text-[#1C1C28]">
                              <Plus className="h-3.5 w-3.5" />
                            </span>
                          </button>
                        ))}
                      {addMatches.length === 0 && (
                        <p className="py-3 text-center text-xs text-muted-foreground">Sin resultados.</p>
                      )}
                    </div>
                  </div>
                  </motion.div>
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
                  {(selectedOrder.tip_amount || 0) > 0 && (
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 text-right">Propina: {formatCurrency(selectedOrder.tip_amount!)}</p>
                  )}
                  {selectedOrder.payments && selectedOrder.payments.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {selectedOrder.payments.map((p, i) => (
                        <span key={i} className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                          {p.label || p.method}: {formatCurrency(p.amount)}
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
                onClick={() => setDetailMode("edit")}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Volver al pedido
              </Button>
            ) : (
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
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
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
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
      />
    </div>
  )
}