"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { ShoppingCart, Package, Edit, Trash2, Eye, Settings, MoreHorizontal, Filter, X, Search, MessageCircle, Camera, CreditCard, Building2, Banknote, Plus } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { es } from "date-fns/locale"
import { ProductForm } from "./product-form"
import { ProductEditForm } from "./product-edit-form"
import { toast } from "sonner"
import { DashboardPagination } from "./dashboard-pagination"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

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
  pagination
}: PedidosClientProps) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [categories, setCategories] = useState<string[]>(initialCategories)
  const [isLoading, setIsLoading] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  
  // Order management state
  const [isEditOrderDialogOpen, setIsEditOrderDialogOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const supabase = createClient()
  const router = useRouter()

  // Extract unique tags from all orders
  const allTags = Array.from(new Set(orders.flatMap(o => o.tags || []))).sort()

  // Filter orders based on selected tags
  const filteredOrders = orders.filter(order => {
    if (selectedTags.length === 0) return true
    if (!order.tags) return false
    return selectedTags.every(tag => order.tags?.includes(tag))
  })

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

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

  const handleUpdateOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedOrder) return

    setIsLoading(true)
    const formData = new FormData(e.currentTarget)
    
    try {
      const { data, error } = await supabase
        .from("orders")
        .update({
          status: formData.get("status"),
          total_amount: parseFloat(formData.get("total_amount") as string),
          delivery_address: formData.get("delivery_address"),
          customer_notes: formData.get("customer_notes"),
        })
        .eq("id", selectedOrder.id)
        .select()
        .single()

      if (error) throw error

      setOrders(orders.map(o => o.id === selectedOrder.id ? { ...o, ...data } : o))
      toast.success("Pedido actualizado correctamente")
      setIsEditOrderDialogOpen(false)
      router.refresh()
    } catch (error) {
      console.error("Error updating order:", error)
      toast.error("No se pudo actualizar el pedido")
    } finally {
      setIsLoading(false)
    }
  }

  const openEditOrderDialog = (order: Order) => {
    setSelectedOrder(order)
    setIsEditOrderDialogOpen(true)
  }

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
      case 'delivered': return 'Entregado'
      case 'cancelled': return 'Cancelado'
      default: return status
    }
  }

  const getPlatformIcon = (platform?: string) => {
    if (platform === 'instagram') return <Camera className="h-4 w-4 text-pink-500" />
    return <MessageCircle className="h-4 w-4 text-green-500" />
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending':    return 'bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800'
      case 'confirmed':  return 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
      case 'preparing':  return 'bg-yellow-100 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800'
      case 'ready':      return 'bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
      case 'delivered':  return 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
      case 'cancelled':  return 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
      default:           return 'bg-gray-100 text-gray-600 border border-gray-200'
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 px-1 pt-2">
        <div>
          <h2 className="text-3xl font-bold dark:text-white">Gestión de Pedidos</h2>
          <p className="text-muted-foreground text-sm mt-1">Administración de órdenes y ventas en tiempo real.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group hidden xl:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-[#B3D93C] transition-colors" />
            <input
              className="pl-10 pr-4 py-2.5 rounded-full border border-border bg-card shadow-sm focus:ring-2 focus:ring-[#D1F366] focus:outline-none w-64 text-sm text-foreground placeholder-muted-foreground transition-all"
              placeholder="Buscar orden o cliente..."
              type="text"
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
            <div className="flex items-center gap-3">
              {selectedTags.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedTags([])} className="text-muted-foreground">
                  Limpiar filtros <X className="ml-1 h-3 w-3" />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full border-dashed">
                    <Filter className="mr-2 h-4 w-4" />
                    Etiquetas
                    {selectedTags.length > 0 && (
                      <span className="ml-2 rounded-full bg-[#D1F366] text-[#1C1C28] text-xs font-bold px-1.5 py-0.5">
                        {selectedTags.length}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[200px]">
                  <DropdownMenuLabel>Filtrar por etiquetas</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {allTags.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">No hay etiquetas</div>
                  ) : (
                    allTags.map((tag) => (
                      <DropdownMenuCheckboxItem key={tag} checked={selectedTags.includes(tag)} onCheckedChange={() => toggleTag(tag)}>
                        {tag}
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                  {selectedTags.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setSelectedTags([])} className="justify-center text-center">
                        Limpiar filtros
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1">
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
            <div className="grid grid-cols-1 gap-4">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-card rounded-3xl p-5 shadow-sm border border-border transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
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
                        <span>{order.client?.name || order.delivery_phone || 'Cliente Anónimo'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CreditCard className="h-3.5 w-3.5" />
                        <span>{getOrderTypeLabel(order.order_type)} · ${order.total_amount}</span>
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
                    <div className="flex items-center gap-2 ml-auto">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-xl">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Detalles del Pedido</DialogTitle>
                            <DialogDescription>Información completa del pedido #{order.id.slice(0, 8)}</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div><Label>Cliente</Label><p>{order.client?.name || order.delivery_phone || 'Cliente Anónimo'}</p></div>
                              <div><Label>Teléfono</Label><p>{order.delivery_phone}</p></div>
                              <div>
                                <Label>Estado</Label>
                                <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${getStatusBadgeClass(order.status)}`}>
                                  {getStatusText(order.status).toUpperCase()}
                                </span>
                              </div>
                              <div><Label>Modalidad</Label><p>{getOrderTypeLabel(order.order_type)}</p></div>
                              <div><Label>Total</Label><p className="font-bold text-lg">${order.total_amount}</p></div>
                              <div><Label>Plataforma</Label><p>{order.conversation?.platform || 'N/A'}</p></div>
                            </div>
                            {order.delivery_address && (
                              <div><Label>Dirección de entrega</Label><p>{order.delivery_address}</p></div>
                            )}
                            {order.customer_notes && (
                              <div><Label>Notas del cliente</Label><p>{order.customer_notes}</p></div>
                            )}
                            <div>
                              <Label>Productos</Label>
                              <div className="mt-2 space-y-2">
                                {Array.isArray(order.items) && order.items.map((item: any, index: number) => (
                                  <div key={index} className="flex justify-between items-center p-2.5 bg-muted rounded-xl">
                                    <span>{item.name || item.product_name || `Producto ${index + 1}`}</span>
                                    <span className="font-semibold">x{item.quantity} · ${item.price}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      <Button
                        onClick={() => openEditOrderDialog(order)}
                        className="px-5 py-2.5 rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold text-sm shadow-sm hover:bg-[#B3D93C] transition-colors whitespace-nowrap"
                      >
                        Procesar Pedido
                      </Button>

                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-9 w-9 p-0 rounded-xl">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditOrderDialog(order)}>
                            <Edit className="mr-2 h-4 w-4" /> Editar
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
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xl font-bold dark:text-white">Catálogo de Productos</h3>
            <ProductForm onProductCreated={refreshProducts} existingCategories={categories} />
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
                    <Input id="delivery_fee" type="number" step="0.01" value={deliverySettings.delivery_fee} className="rounded-xl"
                      onChange={(e) => setDeliverySettings(p => ({ ...p, delivery_fee: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minimum_order">Pedido mínimo ($)</Label>
                    <Input id="minimum_order" type="number" step="0.01" value={deliverySettings.minimum_order_delivery} className="rounded-xl"
                      onChange={(e) => setDeliverySettings(p => ({ ...p, minimum_order_delivery: parseFloat(e.target.value) || 0 }))} />
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

      {/* Edit / Process Order Dialog */}
      <Dialog open={isEditOrderDialogOpen} onOpenChange={setIsEditOrderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Procesar / Editar Pedido</DialogTitle>
            <DialogDescription>Modifica los detalles del pedido.</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <form onSubmit={handleUpdateOrder} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Estado</Label>
                  <Select name="status" defaultValue={selectedOrder.status}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="confirmed">Confirmado</SelectItem>
                      <SelectItem value="preparing">Preparando</SelectItem>
                      <SelectItem value="ready">Listo</SelectItem>
                      <SelectItem value="delivered">Entregado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total_amount">Total ($)</Label>
                  <Input id="total_amount" name="total_amount" type="number" step="0.01" defaultValue={selectedOrder.total_amount} required className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery_address">Dirección de entrega</Label>
                <Input id="delivery_address" name="delivery_address" defaultValue={selectedOrder.delivery_address || ''} placeholder="Dirección completa" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_notes">Notas del cliente</Label>
                <Textarea id="customer_notes" name="customer_notes" defaultValue={selectedOrder.customer_notes || ''} placeholder="Notas adicionales..." className="rounded-xl" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsEditOrderDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isLoading} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
                  {isLoading ? "Guardando..." : "Guardar cambios"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}