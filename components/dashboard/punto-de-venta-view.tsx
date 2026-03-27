"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ShoppingBag, Search, Plus, Minus, X, CreditCard, Banknote, Landmark, Link2, CheckCircle2, ReceiptText, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useIntersectionObserver } from "@/hooks/use-intersection-observer"

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
  total_purchases?: number | null
}

interface CartItem {
  productId: string
  name: string
  price: number
  imageUrl?: string | null
  quantity: number
}

interface PuntoDeVentaViewProps {
  userId: string
  products: Product[]
  categories: string[]
  clients: Client[]
}

const PRODUCTS_PAGE_SIZE = 18

const paymentOptions = [
  { id: "cash", label: "Efectivo", icon: Banknote },
  { id: "card", label: "Tarjeta", icon: CreditCard },
  { id: "transfer", label: "Transferencia", icon: Landmark },
  { id: "link", label: "Link Pago", icon: Link2 },
]

export function PuntoDeVentaView({ userId, products: initialProducts, categories: initialCategories, clients }: PuntoDeVentaViewProps) {
  const supabase = createClient()
  const [activeCategory, setActiveCategory] = useState("Todos")
  const [productSearch, setProductSearch] = useState("")
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [page, setPage] = useState(0)
  const [hasMoreProducts, setHasMoreProducts] = useState(initialProducts.length === PRODUCTS_PAGE_SIZE)
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [isRefetching, setIsRefetching] = useState(false)
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [clientSearch, setClientSearch] = useState("")
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [isSubmitting, setIsSubmitting] = useState(false)

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
  const taxAmount = subtotal * 0.15
  const total = subtotal + taxAmount
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  const fetchProductsPage = async ({
    pageNumber,
    replace,
    category,
    search,
  }: {
    pageNumber: number
    replace: boolean
    category: string
    search: string
  }) => {
    setIsLoadingProducts(true)
    if (replace) setIsRefetching(true)

    try {
      const from = pageNumber * PRODUCTS_PAGE_SIZE
      const to = from + PRODUCTS_PAGE_SIZE - 1
      let query = supabase
        .from("products")
        .select("id, name, description, price, category, is_available, image_url, created_at")
        .eq("user_id", userId)
        .eq("is_available", true)
        .order("created_at", { ascending: false })
        .range(from, to)

      if (category !== "Todos") {
        query = query.eq("category", category)
      }

      const normalizedSearch = search.trim()
      if (normalizedSearch) {
        query = query.or(`name.ilike.%${normalizedSearch}%,description.ilike.%${normalizedSearch}%,category.ilike.%${normalizedSearch}%`)
      }

      const { data, error } = await query
      if (error) throw error

      const nextProducts = (data || []) as Product[]

      setProducts((prev) => {
        if (replace) {
          return nextProducts
        }

        const seen = new Set(prev.map((product) => product.id))
        return [...prev, ...nextProducts.filter((product) => !seen.has(product.id))]
      })

      setHasMoreProducts(nextProducts.length === PRODUCTS_PAGE_SIZE)
      setPage(pageNumber)
    } catch (error) {
      console.error("Error fetching POS products:", error)
      toast.error("No se pudieron cargar mas productos")
    } finally {
      setIsLoadingProducts(false)
      setIsRefetching(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProductsPage({
        pageNumber: 0,
        replace: true,
        category: activeCategory,
        search: productSearch,
      })
    }, 250)

    return () => clearTimeout(timer)
  }, [activeCategory, productSearch])

  useEffect(() => {
    if (!isIntersecting || isLoadingProducts || !hasMoreProducts) {
      return
    }

    fetchProductsPage({
      pageNumber: page + 1,
      replace: false,
      category: activeCategory,
      search: productSearch,
    })
  }, [isIntersecting, isLoadingProducts, hasMoreProducts, page, activeCategory, productSearch])

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

  const addProductToCart = (product: Product) => {
    setCartItems((prev) => {
      const existingItem = prev.find((item) => item.productId === product.id)
      if (existingItem) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }

      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          imageUrl: product.image_url,
          quantity: 1,
        },
      ]
    })

    setIsCartOpen(true)
  }

  const updateQuantity = (productId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    )
  }

  const removeItem = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.productId !== productId))
  }

  const finalizeSale = async () => {
    if (cartItems.length === 0) {
      toast.error("Agrega al menos un producto")
      return
    }

    setIsSubmitting(true)

    try {
      const paymentLabel = paymentOptions.find((option) => option.id === paymentMethod)?.label || "Efectivo"
      const { error } = await supabase
        .from("orders")
        .insert({
          user_id: userId,
          client_id: selectedClient?.id || null,
          status: "confirmed",
          items: cartItems.map((item) => ({
            product_id: item.productId,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.price * item.quantity,
          })),
          total_amount: Number(total.toFixed(2)),
          delivery_phone: selectedClient?.phone || selectedClient?.instagram_username || "venta-local",
          customer_notes: `Venta generada desde Punto de venta. Metodo de pago: ${paymentLabel}`,
        })

      if (error) {
        throw error
      }

      toast.success("Venta registrada correctamente")
      setCartItems([])
      setSelectedClient(null)
      setClientSearch("")
      setPaymentMethod("cash")
      setIsCartOpen(false)
    } catch (error) {
      console.error("Error creating POS order:", error)
      toast.error("No se pudo finalizar la venta")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="h-full bg-[#f3f3f6] px-3 py-3 sm:px-4 sm:py-4 lg:px-0 lg:py-0">
      <div className="mx-auto flex h-full max-w-[1500px] gap-4 overflow-hidden rounded-[2rem] bg-transparent">
        <section
          className={cn(
            "min-w-0 flex-1 rounded-[2rem] bg-[#f7f7fa] p-4 transition-all duration-500 sm:p-5",
            isCartOpen ? "lg:max-w-[calc(100%-25rem)]" : "lg:max-w-full"
          )}
        >
          <div className="mb-4 flex items-center gap-3 rounded-[1.6rem] bg-white px-4 py-3 shadow-[0_10px_30px_rgba(17,24,39,0.04)]">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <Input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Buscar productos por nombre, descripcion o categoria..."
              className="h-auto border-0 bg-transparent p-0 text-sm text-slate-700 shadow-none placeholder:text-slate-400 focus-visible:ring-0"
            />
          </div>

          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={cn(
                  "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  activeCategory === category
                    ? "bg-[#1f2030] text-[#d8ff55]"
                    : "bg-white text-slate-400 hover:text-slate-700"
                )}
              >
                {category}
              </button>
            ))}
          </div>

          {isRefetching ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] 2xl:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
              {Array.from({ length: PRODUCTS_PAGE_SIZE }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-[2rem] bg-white p-3 shadow-[0_10px_35px_rgba(17,24,39,0.05)]">
                  <div className="relative mb-3 overflow-hidden rounded-[1.5rem] bg-[#eef0f3] p-2">
                    <div className="aspect-square rounded-[1.25rem] bg-slate-200" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 rounded-full bg-slate-200" />
                    <div className="h-3 w-3/4 rounded-full bg-slate-200" />
                    <div className="flex items-center justify-between pt-2">
                      <div className="h-6 w-24 rounded-full bg-slate-200" />
                      <div className="h-8 w-8 rounded-full bg-slate-200" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 && !isLoadingProducts ? (
            <div className="flex h-[420px] items-center justify-center rounded-[2rem] border border-dashed border-slate-200 bg-white text-center text-slate-500">
              <div className="max-w-sm px-6">
                <p className="text-lg font-semibold text-slate-700">No hay productos disponibles</p>
                <p className="mt-2 text-sm text-slate-500">Carga productos en tu catalogo para empezar a vender desde esta seccion.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] 2xl:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
                {products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProductToCart(product)}
                    className="group rounded-[2rem] bg-white p-3 text-left shadow-[0_10px_35px_rgba(17,24,39,0.05)] transition-transform duration-200 hover:-translate-y-1"
                  >
                    <div className="relative mb-3 overflow-hidden rounded-[1.5rem] bg-[#eef0f3] p-2">
                      <div className="aspect-square overflow-hidden rounded-[1.25rem] bg-white">
                        {product.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
                            <ShoppingBag className="h-10 w-10" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 space-y-1">
                      <h3 className="line-clamp-2 min-h-[3rem] text-[15px] font-semibold leading-tight text-slate-900">{product.name}</h3>
                      <p className="line-clamp-2 min-h-[2.5rem] text-xs text-slate-400">{product.description || product.category || "Producto disponible para venta inmediata"}</p>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="min-w-0 text-lg font-black leading-none tracking-tight text-slate-900 sm:text-xl xl:text-2xl">
                          {formatCurrency(product.price)}
                        </span>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f0f2f5] text-slate-600 transition-colors group-hover:bg-[#d8ff55] group-hover:text-slate-900">
                          <Plus className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div ref={loadMoreRef} className="flex justify-center py-6">
                {isLoadingProducts ? (
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                ) : hasMoreProducts ? (
                  <div className="h-5" />
                ) : products.length > 0 ? (
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">No hay mas productos</p>
                ) : null}
              </div>
            </>
          )}
        </section>

        <aside
          className={cn(
            "fixed inset-y-0 right-0 z-40 w-full max-w-[420px] transform bg-white p-4 shadow-2xl transition-transform duration-500 ease-out lg:static lg:h-auto lg:rounded-[2rem] lg:p-4 lg:shadow-none",
            isCartOpen ? "translate-x-0" : "translate-x-full lg:w-0 lg:max-w-0 lg:p-0 lg:opacity-0"
          )}
        >
          <div className={cn("h-full overflow-hidden rounded-[2rem] bg-white", !isCartOpen && "lg:hidden")}>
            <ScrollArea className="h-full">
              <div className="space-y-4 p-3 sm:p-4">
                <div className="rounded-[1.75rem] bg-[#1f2030] p-4 text-white">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d8ff55]">Cliente</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href="/dashboard/clientes" className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">
                        Crear nuevo
                      </Link>
                      <button type="button" className="lg:hidden" onClick={() => setIsCartOpen(false)}>
                        <X className="h-4 w-4 text-white/70" />
                      </button>
                    </div>
                  </div>

                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <Input
                      value={clientSearch}
                      onChange={(event) => setClientSearch(event.target.value)}
                      placeholder="Buscar cliente..."
                      className="border-white/10 bg-white/10 pl-10 text-white placeholder:text-white/35"
                    />
                  </div>

                  {selectedClient ? (
                    <div className="flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-white/5 p-3">
                      <Avatar className="h-11 w-11 border border-white/15">
                        <AvatarFallback className="bg-[#d8ff55] text-sm font-bold text-slate-900">
                          {getInitials(selectedClient.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{selectedClient.name}</p>
                        <p className="truncate text-xs text-white/55">{getClientHandle(selectedClient)}</p>
                      </div>
                      <button type="button" onClick={() => setSelectedClient(null)}>
                        <X className="h-4 w-4 text-white/45" />
                      </button>
                    </div>
                  ) : filteredClients.length > 0 ? (
                    <div className="space-y-2">
                      {filteredClients.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => setSelectedClient(client)}
                          className="flex w-full items-center gap-3 rounded-[1.25rem] border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
                        >
                          <Avatar className="h-10 w-10 border border-white/10">
                            <AvatarFallback className="bg-white text-xs font-bold text-slate-900">
                              {getInitials(client.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{client.name}</p>
                            <p className="truncate text-xs text-white/55">{getClientHandle(client)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : clientSearch.trim() ? (
                    <div className="rounded-[1.25rem] border border-dashed border-white/15 bg-white/5 p-4 text-center text-sm text-white/55">
                      No encontramos clientes con esa busqueda.
                    </div>
                  ) : (
                    <div className="rounded-[1.25rem] border border-dashed border-white/15 bg-white/5 p-4 text-center text-sm text-white/55">
                      Escribe para buscar y asignar un cliente a la venta.
                    </div>
                  )}
                </div>

                <div className="rounded-[1.75rem] border border-slate-100 bg-[#f8f8fb] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Carrito actual</p>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">{totalItems} productos</p>
                  </div>

                  {cartItems.length === 0 ? (
                    <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                      Toca cualquier producto para empezar a armar el pedido.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cartItems.map((item) => (
                        <div key={item.productId} className="flex items-center gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm">
                          <div className="h-14 w-14 overflow-hidden rounded-[1rem] bg-slate-100">
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
                            <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                            <p className="text-xs text-slate-400">{formatCurrency(item.price)} / ud</p>
                            <div className="mt-2 flex items-center gap-2">
                              <button type="button" onClick={() => updateQuantity(item.productId, -1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="min-w-6 text-center text-sm font-semibold text-slate-700">{item.quantity}</span>
                              <button type="button" onClick={() => updateQuantity(item.productId, 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          <div className="flex h-full flex-col items-end justify-between gap-2">
                            <button type="button" onClick={() => removeItem(item.productId)}>
                              <X className="h-4 w-4 text-slate-300" />
                            </button>
                            <p className="text-sm font-bold text-slate-800">{formatCurrency(item.price * item.quantity)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-[1.75rem] border border-slate-100 bg-[#f8f8fb] p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Metodo de pago</p>
                  <div className="grid grid-cols-2 gap-3">
                    {paymentOptions.map((option) => {
                      const Icon = option.icon
                      const isActive = paymentMethod === option.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setPaymentMethod(option.id)}
                          className={cn(
                            "rounded-[1.15rem] border p-4 text-center transition-all",
                            isActive
                              ? "border-transparent bg-[#1f2030] text-[#d8ff55] shadow-lg"
                              : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-700"
                          )}
                        >
                          <Icon className="mx-auto mb-2 h-5 w-5" />
                          <span className="text-xs font-semibold">{option.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="space-y-2 text-sm text-slate-500">
                    <div className="flex items-center justify-between">
                      <span>Subtotal</span>
                      <span className="font-semibold text-slate-700">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Impuestos (15%)</span>
                      <span className="font-semibold text-slate-700">{formatCurrency(taxAmount)}</span>
                    </div>
                  </div>

                  <div className="mt-5 flex items-end justify-between border-t border-slate-100 pt-4">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-[0.25em] text-slate-500">Total</p>
                    </div>
                    <p className="text-4xl font-black tracking-tight text-slate-900">{formatCurrency(total)}</p>
                  </div>

                  <Button
                    onClick={finalizeSale}
                    disabled={isSubmitting || cartItems.length === 0}
                    className="mt-5 h-14 w-full rounded-full bg-[#d8ff55] text-sm font-bold uppercase tracking-[0.25em] text-slate-900 hover:bg-[#c8ef42]"
                  >
                    {isSubmitting ? "Procesando..." : "Finalizar venta"}
                    <CheckCircle2 className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </div>
        </aside>
      </div>

      {!isCartOpen && cartItems.length > 0 && (
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-6 right-6 z-30 flex h-14 items-center gap-3 rounded-full bg-[#1f2030] px-5 text-sm font-semibold text-white shadow-2xl lg:hidden"
        >
          <ReceiptText className="h-5 w-5 text-[#d8ff55]" />
          Ver carrito
          <Badge className="bg-[#d8ff55] text-slate-900 hover:bg-[#d8ff55]">{totalItems}</Badge>
        </button>
      )}
    </div>
  )
}