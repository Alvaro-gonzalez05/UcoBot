"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ShoppingBag, Search, Plus, Minus, X, CreditCard, Banknote, Landmark, Link2, CheckCircle2, ReceiptText, Loader2, QrCode, Gift } from "lucide-react"
import { toast } from "sonner"
import { useIntersectionObserver } from "@/hooks/use-intersection-observer"
import { LoyaltyScannerDialog } from "@/components/loyalty/loyalty-scanner-dialog"
import { broadcastLoyaltyUpdate } from "@/lib/loyalty-realtime"

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
  productId: string
  name: string
  price: number
  imageUrl?: string | null
  quantity: number
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

  // Fidelización
  const [scannerOpen, setScannerOpen] = useState(false)
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null)
  const [redeemedReward, setRedeemedReward] = useState<Reward | null>(null)
  const [redeemStampGift, setRedeemStampGift] = useState(false)

  const isStampsMode = loyaltySettings?.card_type === "stamps"

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

  // Descuento por canje de premio (porcentaje o monto fijo, capado al subtotal)
  const rewardDiscount = useMemo(() => {
    if (!redeemedReward) return 0
    return parseRewardDiscount(redeemedReward, subtotal)
  }, [redeemedReward, subtotal])

  const discountedSubtotal = subtotal - rewardDiscount
  const taxAmount = discountedSubtotal * 0.15
  const total = discountedSubtotal + taxAmount
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

    // On desktop (lg ≥ 1024px) open the cart panel automatically.
    // On mobile the floating bubble handles the entry point.
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setIsCartOpen(true)
    }
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
      const paymentLabel = paymentOptions.find((option) => option.id === paymentMethod)?.label || "Efectivo"

      const orderItems = cartItems.map((item) => ({
        product_id: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity,
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

      const { error } = await supabase
        .from("orders")
        .insert({
          user_id: userId,
          client_id: selectedClient?.id || null,
          status: status,
          items: orderItems,
          total_amount: Number(total.toFixed(2)),
          delivery_phone: selectedClient?.phone || selectedClient?.instagram_username || "venta-local",
          customer_notes: `Venta generada desde Punto de venta. Metodo de pago: ${paymentLabel}${redeemedReward ? `. Canje: ${redeemedReward.name}` : ""}`,
          source: "pos",
        })

      if (error) {
        throw error
      }

      // Procesar fidelización (no bloquea la venta si falla)
      if (selectedClient && isStampsMode && loyaltySettings) {
        try {
          // Modo sellos: +1 sello por compra; el canje consume la tarjeta completa
          let stampsDelta = loyaltySettings.is_active ? 1 : 0
          if (redeemStampGift) {
            stampsDelta -= loyaltySettings.stamps_required
            await supabase.from("points_transactions").insert({
              user_id: userId,
              client_id: selectedClient.id,
              transaction_type: "redeemed",
              points_amount: 0,
              description: `Tarjeta de sellos completa: canje de "${loyaltySettings.stamp_reward || "regalo"}" (Punto de venta)`,
            })
          }

          const newStamps = Math.max(0, (selectedClient.stamps || 0) + stampsDelta)
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
            const required = loyaltySettings.stamps_required
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

      toast.success(status === "completed" ? "Venta registrada como finalizada" : "Pedido pasado correctamente")
      setCartItems([])
      setSelectedClient(null)
      setClientSearch("")
      setPaymentMethod("cash")
      setRedeemedReward(null)
      setRedeemStampGift(false)
      setIsCartOpen(false)
    } catch (error) {
      console.error("Error creating POS order:", error)
      toast.error("No se pudo procesar el pedido")
    } finally {
      setIsSubmitting(false)
    }
  }

  const finalizeSale = () => submitSale("completed")
  const moveOrder = () => submitSale("pending")

  return (
    <div className="h-full w-full bg-[#f3f3f6] dark:bg-background p-3 sm:p-4 lg:p-4 xl:p-6 overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1500px] gap-4 overflow-hidden rounded-[2rem] bg-transparent">
        <section
          className={cn(
            "min-w-0 flex-1 rounded-[2rem] bg-[#f7f7fa] dark:bg-background p-4 transition-all duration-500 sm:p-5",
            isCartOpen ? "lg:mr-0" : ""
          )}
        >
          <div className="mb-4 flex items-center gap-3 rounded-[1.6rem] bg-white dark:bg-muted px-4 py-3 shadow-[0_10px_30px_rgba(17,24,39,0.04)] dark:shadow-none">
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
                    : "bg-white dark:bg-muted text-slate-400 hover:text-slate-700 dark:hover:text-foreground"
                )}
              >
                {category}
              </button>
            ))}
          </div>

          {isRefetching ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] 2xl:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
              {Array.from({ length: PRODUCTS_PAGE_SIZE }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-[2rem] bg-white dark:bg-muted p-3 shadow-[0_10px_35px_rgba(17,24,39,0.05)] dark:shadow-none">
                  <div className="relative mb-3 overflow-hidden rounded-[1.5rem] bg-[#eef0f3] dark:bg-muted dark:bg-muted/60 p-2">
                    <div className="aspect-square rounded-[1.25rem] bg-slate-200 dark:bg-muted-foreground/20" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 rounded-full bg-slate-200 dark:bg-muted-foreground/20" />
                    <div className="h-3 w-3/4 rounded-full bg-slate-200 dark:bg-muted-foreground/20" />
                    <div className="flex items-center justify-between pt-2">
                      <div className="h-6 w-24 rounded-full bg-slate-200 dark:bg-muted-foreground/20" />
                      <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-muted-foreground/20" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 && !isLoadingProducts ? (
            <div className="flex h-[420px] items-center justify-center rounded-[2rem] border border-dashed border-slate-200 dark:border-border bg-white dark:bg-card text-center text-slate-500 dark:text-muted-foreground">
              <div className="max-w-sm px-6">
                <p className="text-lg font-semibold text-slate-700 dark:text-foreground">No hay productos disponibles</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-muted-foreground">Carga productos en tu catalogo para empezar a vender desde esta seccion.</p>
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
                    className="group rounded-[2rem] bg-white dark:bg-card p-3 text-left border border-muted shadow-[0_10px_35px_rgba(17,24,39,0.05)] dark:shadow-none transition-transform duration-200 hover:-translate-y-1"
                  >
                    {product.image_url && (
                      <div className="relative mb-3 overflow-hidden rounded-[1.5rem] bg-[#eef0f3] dark:bg-muted p-2">
                        <div className="aspect-square overflow-hidden rounded-[1.25rem] bg-white dark:bg-card">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                      </div>
                    )}

                    <div className="min-w-0 space-y-1">
                      <h3 className="line-clamp-2 min-h-[3rem] text-[15px] font-semibold leading-tight text-slate-900 dark:text-foreground">{product.name}</h3>
                      <p className="line-clamp-2 min-h-[2.5rem] text-xs text-slate-400">{product.description || product.category || "Producto disponible para venta inmediata"}</p>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-lg font-black leading-none tracking-tight text-slate-900 dark:text-foreground sm:text-xl">
                            {formatCurrency(product.price)}
                          </span>
                        </div>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f0f2f5] dark:bg-muted text-slate-600 dark:text-muted-foreground transition-colors group-hover:bg-[#d8ff55] group-hover:text-slate-900">
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
            "fixed inset-y-0 right-0 z-40 w-full max-w-[420px] transform bg-white dark:bg-card p-4 shadow-2xl transition-transform duration-500 ease-out lg:static lg:h-auto lg:w-[420px] lg:shrink-0 lg:rounded-[2rem] lg:p-4 lg:shadow-none",
            isCartOpen ? "translate-x-0" : "translate-x-full lg:w-0 lg:max-w-0 lg:p-0 lg:opacity-0"
          )}
        >
          <div className={cn("flex h-full w-full flex-col overflow-hidden rounded-[2rem] bg-white dark:bg-card", !isCartOpen && "lg:hidden")}>
            <div className="flex-1 w-full overflow-y-auto overflow-x-hidden pt-1 custom-scrollbar">
              <div className="w-full min-w-0 space-y-4 p-3 pb-24 sm:p-4 lg:pb-4 text-left">
                <div className="w-full rounded-[1.75rem] bg-[#1f2030] p-4 text-white">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d8ff55]">Cliente</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setScannerOpen(true)}
                        className="flex items-center gap-1.5 rounded-full bg-[#d8ff55]/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#d8ff55] transition-colors hover:bg-[#d8ff55]/25"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        Escanear
                      </button>
                      <Link href="/dashboard/clientes" className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60 hover:text-white transition-colors">
                        Crear nuevo
                      </Link>
                      <button 
                        type="button" 
                        onClick={() => setIsCartOpen(false)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                      >
                        <X className="h-5 w-5" />
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
                        <p className="truncate text-xs text-white/55">
                          {getClientHandle(selectedClient)} ·{" "}
                          {isStampsMode
                            ? `🔘 ${selectedClient.stamps || 0}/${loyaltySettings?.stamps_required || 10} sellos`
                            : `⭐ ${selectedClient.points || 0} pts`}
                        </p>
                      </div>
                      <button type="button" onClick={() => { setSelectedClient(null); setRedeemedReward(null) }}>
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

                <div className="w-full rounded-[1.75rem] border border-slate-100 bg-[#f8f8fb] dark:bg-muted/30 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
                        <div key={item.productId} className="flex min-w-0 flex-row items-center gap-3 rounded-[1.25rem] bg-white dark:bg-card p-3 shadow-sm dark:shadow-none">
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
                            <p className="truncate text-xs text-slate-400 mt-1">{formatCurrency(item.price)} / ud</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <button type="button" onClick={() => updateQuantity(item.productId, -1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-muted text-slate-600 dark:text-muted-foreground transition-colors hover:bg-slate-200 dark:hover:bg-muted/70">
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="min-w-4 text-center text-sm font-semibold text-slate-700 dark:text-foreground">{item.quantity}</span>
                              <button type="button" onClick={() => updateQuantity(item.productId, 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-muted text-slate-600 dark:text-muted-foreground transition-colors hover:bg-slate-200 dark:hover:bg-muted/70">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          <div className="flex h-full shrink-0 flex-col items-end justify-between gap-2 overflow-hidden text-right">
                            <button type="button" onClick={() => removeItem(item.productId)} className="shrink-0 p-1 hover:bg-slate-50 dark:hover:bg-muted transition-colors rounded-full">
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

                <div className="w-full rounded-[1.75rem] border border-slate-100 bg-[#f8f8fb] dark:bg-muted/30 p-4">
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
                              : "border-slate-200 dark:border-border bg-white dark:bg-card text-slate-400 hover:border-slate-300 hover:text-slate-700 dark:hover:text-foreground"
                          )}
                        >
                          <Icon className="mx-auto mb-2 h-5 w-5" />
                          <span className="text-xs font-semibold">{option.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="w-full rounded-[1.75rem] border border-slate-100 dark:border-border bg-white dark:bg-card p-4 shadow-sm dark:shadow-none">
                  <div className="space-y-2 text-sm text-slate-500 dark:text-muted-foreground">
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
                    <div className="flex items-center justify-between">
                      <span>Impuestos (15%)</span>
                      <span className="font-semibold text-slate-700 dark:text-foreground">{formatCurrency(taxAmount)}</span>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-end justify-between border-t border-slate-100 dark:border-border pt-4 gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-muted-foreground">Total</p>
                    </div>
                    <p className="min-w-0 truncate text-3xl font-black tracking-tight text-slate-900 dark:text-foreground sm:text-4xl">{formatCurrency(total)}</p>
                  </div>

                  <div className="flex flex-col gap-2 mt-5">
                    <Button
                      onClick={finalizeSale}
                      disabled={isSubmitting || cartItems.length === 0}
                      className="h-14 w-full rounded-[1.25rem] bg-[#d8ff55] text-sm font-bold uppercase tracking-[0.25em] text-slate-900 hover:bg-[#c8ef42]"
                    >
                      {isSubmitting ? "Procesando..." : "Finalizar venta"}
                      <CheckCircle2 className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      onClick={moveOrder}
                      disabled={isSubmitting || cartItems.length === 0}
                      variant="outline"
                      className="h-12 w-full rounded-[1.25rem] border-slate-200 dark:border-border text-sm font-bold uppercase tracking-[0.25em] text-slate-600 dark:text-muted-foreground hover:bg-slate-50 dark:hover:bg-muted hover:text-slate-900 dark:hover:text-foreground"
                    >
                      Pasar pedido
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <LoyaltyScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} onScan={handleCardScan} />

      {!isCartOpen && cartItems.length > 0 && (
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-6 right-6 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-[#1f2030] shadow-2xl lg:hidden"
          aria-label="Ver carrito"
        >
          <ReceiptText className="h-6 w-6 text-[#d8ff55]" />
          <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#d8ff55] text-xs font-black text-slate-900">
            {totalItems}
          </span>
        </button>
      )}
    </div>
  )
}