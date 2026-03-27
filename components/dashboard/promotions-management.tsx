"use client"

import type React from "react"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { Plus, Gift, Percent, Star, Users, MoreVertical, Trash2, Play, Pause, Award, Loader2, X, Tag, Megaphone, Ticket } from "lucide-react"

interface Promotion {
  id: string
  name: string
  description?: string
  max_uses?: number
  current_uses: number
  start_date: string
  end_date: string
  is_active: boolean
  image_url?: string
  created_at: string
}

interface Reward {
  id: string
  name: string
  description?: string
  points_cost: number
  reward_type: "discount" | "free_item" | "service" | "gift"
  reward_value?: string
  stock_quantity?: number
  current_stock?: number
  is_active: boolean
  created_at: string
}

interface PromotionsManagementProps {
  initialPromotions: Promotion[]
  initialRewards: Reward[]
  userId: string
}

const rewardTypeLabels = {
  discount: "Descuento",
  free_item: "Producto Gratis",
  service: "Servicio",
  gift: "Regalo",
}

function getDaysUntilExpiry(endDate: string): string {
  const now = new Date()
  const end = new Date(endDate)
  const diffMs = end.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return "Vencida"
  if (diffDays === 0) return "Hoy"
  if (diffDays === 1) return "Mañana"
  return `${diffDays} días`
}

function getDaysUntilExpiryColor(endDate: string): string {
  const now = new Date()
  const end = new Date(endDate)
  const diffMs = end.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return "text-gray-400"
  if (diffDays <= 1) return "text-red-500"
  if (diffDays <= 7) return "text-amber-500"
  return "text-gray-700"
}

function getPromotionProgress(promotion: Promotion): number {
  if (!promotion.max_uses) return 100
  return Math.min(100, Math.round((promotion.current_uses / promotion.max_uses) * 100))
}

export function PromotionsManagement({ initialPromotions, initialRewards, userId }: PromotionsManagementProps) {
  const [promotions, setPromotions] = useState<Promotion[]>(initialPromotions)
  const [rewards, setRewards] = useState<Reward[]>(initialRewards)
  const [isPromotionDialogOpen, setIsPromotionDialogOpen] = useState(false)
  const [isRewardDialogOpen, setIsRewardDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("promotions")
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [imageUploadMethod, setImageUploadMethod] = useState<"url" | "upload">("url")
  const supabase = createClient()

  const [promotionForm, setPromotionForm] = useState({
    name: "",
    description: "",
    max_uses: "",
    start_date: "",
    end_date: "",
    is_active: true,
    image_url: "",
  })

  const [rewardForm, setRewardForm] = useState({
    name: "",
    description: "",
    points_cost: 0,
    reward_type: "" as "discount" | "free_item" | "service" | "gift" | "",
    reward_value: "",
    stock_quantity: "",
    is_active: true,
  })

  const resetPromotionForm = () => {
    setPromotionForm({ name: "", description: "", max_uses: "", start_date: "", end_date: "", is_active: true, image_url: "" })
  }

  const resetRewardForm = () => {
    setRewardForm({ name: "", description: "", points_cost: 0, reward_type: "", reward_value: "", stock_quantity: "", is_active: true })
  }

  const handleCreatePromotion = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const promotionData = {
        user_id: userId,
        name: promotionForm.name,
        description: promotionForm.description || null,
        max_uses: promotionForm.max_uses ? Number.parseInt(promotionForm.max_uses) : null,
        current_uses: 0,
        start_date: promotionForm.start_date,
        end_date: promotionForm.end_date,
        is_active: promotionForm.is_active,
        image_url: promotionForm.image_url || null,
      }
      const { data, error } = await supabase.from("promotions").insert([promotionData]).select().single()
      if (error) throw error
      setPromotions([data, ...promotions])
      setIsPromotionDialogOpen(false)
      resetPromotionForm()
      toast.success(`Promoción "${promotionForm.name}" creada`, { description: "La promoción ha sido creada exitosamente y está disponible para los clientes.", duration: 4000 })
    } catch (error) {
      console.error("Error creating promotion:", error)
      toast.error("Error al crear promoción", { description: "No se pudo crear la promoción. Verifica los datos e inténtalo de nuevo.", duration: 4000 })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from("rewards")
        .insert([{ ...rewardForm, user_id: userId, stock_quantity: rewardForm.stock_quantity ? Number.parseInt(rewardForm.stock_quantity) : null, current_stock: rewardForm.stock_quantity ? Number.parseInt(rewardForm.stock_quantity) : null }])
        .select()
        .single()
      if (error) throw error
      setRewards([data, ...rewards])
      setIsRewardDialogOpen(false)
      resetRewardForm()
      toast.success(`Recompensa "${rewardForm.name}" creada`, { description: "La recompensa ha sido creada exitosamente.", duration: 4000 })
    } catch (error) {
      toast.error("Error al crear recompensa", { description: "No se pudo crear la recompensa. Verifica los datos e inténtalo de nuevo.", duration: 4000 })
    } finally {
      setIsLoading(false)
    }
  }

  const handleTogglePromotion = async (promotionId: string, isActive: boolean) => {
    try {
      const { error } = await supabase.from("promotions").update({ is_active: isActive }).eq("id", promotionId)
      if (error) throw error
      setPromotions(promotions.map((p) => (p.id === promotionId ? { ...p, is_active: isActive } : p)))
      const promotion = promotions.find((p) => p.id === promotionId)
      toast.success(`Promoción ${isActive ? "activada" : "desactivada"}`, { description: `"${promotion?.name || "La promoción"}" ha sido ${isActive ? "activada" : "desactivada"} exitosamente.`, duration: 4000 })
    } catch (error) {
      toast.error("Error al cambiar estado de promoción", { description: "No se pudo cambiar el estado. Inténtalo de nuevo.", duration: 4000 })
    }
  }

  const handleToggleReward = async (rewardId: string, isActive: boolean) => {
    try {
      const { error } = await supabase.from("rewards").update({ is_active: isActive }).eq("id", rewardId)
      if (error) throw error
      setRewards(rewards.map((r) => (r.id === rewardId ? { ...r, is_active: isActive } : r)))
      const reward = rewards.find((r) => r.id === rewardId)
      toast.success(`Recompensa ${isActive ? "activada" : "desactivada"}`, { description: `"${reward?.name || "La recompensa"}" ha sido ${isActive ? "activada" : "desactivada"} exitosamente.`, duration: 4000 })
    } catch (error) {
      toast.error("Error al cambiar estado de recompensa", { description: "No se pudo cambiar el estado. Inténtalo de nuevo.", duration: 4000 })
    }
  }

  const handleDeletePromotion = async (promotionId: string) => {
    try {
      const promotion = promotions.find((p) => p.id === promotionId)
      const { error } = await supabase.from("promotions").delete().eq("id", promotionId)
      if (error) throw error
      setPromotions(promotions.filter((p) => p.id !== promotionId))
      toast.success("Promoción eliminada", { description: `"${promotion?.name || "La promoción"}" ha sido eliminada permanentemente.`, duration: 4000 })
    } catch (error) {
      toast.error("Error al eliminar promoción", { description: "No se pudo eliminar la promoción. Inténtalo de nuevo.", duration: 4000 })
    }
  }

  const handleDeleteReward = async (rewardId: string) => {
    try {
      const reward = rewards.find((r) => r.id === rewardId)
      const { error } = await supabase.from("rewards").delete().eq("id", rewardId)
      if (error) throw error
      setRewards(rewards.filter((r) => r.id !== rewardId))
      toast.success("Recompensa eliminada", { description: `"${reward?.name || "La recompensa"}" ha sido eliminada permanentemente.`, duration: 4000 })
    } catch (error) {
      toast.error("Error al eliminar recompensa", { description: "No se pudo eliminar la recompensa. Inténtalo de nuevo.", duration: 4000 })
    }
  }

  const isPromotionActive = (promotion: Promotion) => {
    const now = new Date()
    const startDate = new Date(promotion.start_date)
    const endDate = new Date(promotion.end_date)
    return promotion.is_active && now >= startDate && now <= endDate
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
    if (!allowedTypes.includes(file.type)) { toast.error("Formato no soportado. Usa JPG, PNG, GIF o WebP"); return }
    if (file.size > 5 * 1024 * 1024) { toast.error("El archivo es muy grande. Máximo 5MB permitido"); return }
    setIsUploading(true)
    toast.loading("Subiendo imagen...", { id: "upload-image" })
    try {
      const formDataUpload = new FormData()
      formDataUpload.append("file", file)
      const response = await fetch("/api/upload-image", { method: "POST", body: formDataUpload })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Error al subir imagen")
      setPromotionForm((prev) => ({ ...prev, image_url: result.url }))
      toast.success("Imagen subida exitosamente", { id: "upload-image" })
    } catch (error) {
      console.error("Error uploading image:", error)
      toast.error(error instanceof Error ? error.message : "Error al subir imagen", { id: "upload-image" })
    } finally {
      setIsUploading(false)
    }
  }

  const activePromotionsCount = promotions.filter((p) => isPromotionActive(p)).length
  const totalUses = promotions.reduce((sum, p) => sum + p.current_uses, 0)
  const activeRewardsCount = rewards.filter((r) => r.is_active).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Promociones</h2>
          <p className="text-sm text-gray-500">Crea y administra tus campañas de descuentos y recompensas.</p>
        </div>
        <button
          onClick={() => { if (activeTab === "rewards") { setIsRewardDialogOpen(true) } else { setIsPromotionDialogOpen(true) } }}
          className="flex items-center gap-2 px-5 py-3 bg-[#D1F366] text-[#1C1C28] rounded-xl font-bold transition-all shadow-lg shadow-[#D1F366]/20 hover:bg-[#B3D93C]"
        >
          <Plus className="w-4 h-4" />
          <span>{activeTab === "rewards" ? "Nueva Recompensa" : "Nueva Promoción"}</span>
        </button>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6 flex-shrink-0">
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Promociones Activas</p>
              <p className="text-2xl font-bold text-gray-900">{activePromotionsCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Cupones Canjeados</p>
              <p className="text-2xl font-bold text-gray-900">{totalUses.toLocaleString("es-ES")}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-50 text-green-500 rounded-2xl flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Recompensas Activas</p>
              <p className="text-2xl font-bold text-gray-900">{activeRewardsCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="promotions" className="flex-1 flex flex-col overflow-hidden" onValueChange={setActiveTab}>
        <TabsList className="flex-shrink-0 bg-white border border-gray-100 rounded-2xl p-1 mb-4 w-fit">
          <TabsTrigger
            value="promotions"
            className="rounded-xl px-6 py-2 text-sm font-semibold data-[state=active]:bg-[#D1F366] data-[state=active]:text-[#1C1C28] data-[state=active]:shadow-none text-gray-500"
          >
            Promociones
          </TabsTrigger>
          <TabsTrigger
            value="rewards"
            className="rounded-xl px-6 py-2 text-sm font-semibold data-[state=active]:bg-[#D1F366] data-[state=active]:text-[#1C1C28] data-[state=active]:shadow-none text-gray-500"
          >
            Recompensas
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="rounded-xl px-6 py-2 text-sm font-semibold data-[state=active]:bg-[#D1F366] data-[state=active]:text-[#1C1C28] data-[state=active]:shadow-none text-gray-500"
          >
            Configuración
          </TabsTrigger>
        </TabsList>

        {/* Promotions Tab */}
        <TabsContent value="promotions" className="flex-1 overflow-hidden flex flex-col mt-0">
          <h3 className="font-bold text-lg mb-4 flex-shrink-0">Mis Promociones</h3>
          <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col gap-4 pb-4">
            {promotions.length === 0 ? (
              <div className="bg-white rounded-3xl border border-gray-100 p-12 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-[#D1F366]/20 rounded-2xl flex items-center justify-center mb-4">
                  <Percent className="w-8 h-8 text-[#1C1C28]" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">No tienes promociones aún</h3>
                <p className="text-sm text-gray-500 mb-5">Crea tu primera promoción para atraer y fidelizar clientes</p>
                <button
                  onClick={() => setIsPromotionDialogOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#D1F366] text-[#1C1C28] rounded-xl font-bold text-sm hover:bg-[#B3D93C] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Crear mi primera promoción
                </button>
              </div>
            ) : (
              promotions.map((promotion) => {
                const progress = getPromotionProgress(promotion)
                const active = isPromotionActive(promotion)
                const expiryText = getDaysUntilExpiry(promotion.end_date)
                const expiryColor = getDaysUntilExpiryColor(promotion.end_date)
                return (
                  <div
                    key={promotion.id}
                    className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between group hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-6 flex-1 min-w-0">
                      {promotion.image_url ? (
                        <img
                          src={promotion.image_url}
                          alt={promotion.name}
                          className="w-16 h-16 rounded-2xl object-cover flex-shrink-0"
                          onError={(e) => { ;(e.target as HTMLImageElement).style.display = "none" }}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-[#D1F366]/10 flex items-center justify-center text-[#1C1C28] flex-shrink-0">
                          <Tag className="w-7 h-7" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <h4 className="font-bold text-lg text-gray-900 truncate">{promotion.name}</h4>
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {active ? "Activa" : "Inactiva"}
                          </span>
                        </div>
                        {promotion.description && (
                          <p className="text-xs text-gray-500 mb-2 truncate">{promotion.description}</p>
                        )}
                        <div className="flex flex-col gap-1 mt-2">
                          <div className="flex justify-between text-xs font-medium text-gray-500">
                            <span>Límite de uso</span>
                            <span>{promotion.current_uses} / {promotion.max_uses ? promotion.max_uses.toLocaleString("es-ES") : "Sin límite"} canjes</span>
                          </div>
                          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div className="bg-[#D1F366] h-full rounded-full transition-all" style={{ width: `${promotion.max_uses ? progress : 100}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-8 flex-shrink-0 ml-4">
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Vence en</p>
                        <p className={`text-sm font-semibold ${expiryColor}`}>{expiryText}</p>
                      </div>
                      <Switch
                        checked={promotion.is_active}
                        onCheckedChange={(checked) => handleTogglePromotion(promotion.id, checked)}
                        className="data-[state=checked]:bg-[#D1F366]"
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-2 text-gray-400 hover:text-gray-700 transition-colors rounded-lg hover:bg-gray-100">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl">
                          <DropdownMenuItem onClick={() => handleTogglePromotion(promotion.id, !promotion.is_active)}>
                            {promotion.is_active ? (<><Pause className="mr-2 h-4 w-4" />Desactivar</>) : (<><Play className="mr-2 h-4 w-4" />Activar</>)}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeletePromotion(promotion.id)} className="text-red-500 focus:text-red-500">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </TabsContent>

        {/* Rewards Tab */}
        <TabsContent value="rewards" className="flex-1 overflow-hidden flex flex-col mt-0">
          <h3 className="font-bold text-lg mb-4 flex-shrink-0">Catálogo de Recompensas</h3>
          <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col gap-4 pb-4">
            {rewards.length === 0 ? (
              <div className="bg-white rounded-3xl border border-gray-100 p-12 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-[#D1F366]/20 rounded-2xl flex items-center justify-center mb-4">
                  <Gift className="w-8 h-8 text-[#1C1C28]" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">No tienes recompensas aún</h3>
                <p className="text-sm text-gray-500 mb-5">Crea recompensas que tus clientes puedan canjear con puntos</p>
                <button
                  onClick={() => setIsRewardDialogOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#D1F366] text-[#1C1C28] rounded-xl font-bold text-sm hover:bg-[#B3D93C] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Crear mi primera recompensa
                </button>
              </div>
            ) : (
              rewards.map((reward) => (
                <div
                  key={reward.id}
                  className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between group hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-6 flex-1 min-w-0">
                    <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                      <Award className="w-7 h-7" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <h4 className="font-bold text-lg text-gray-900 truncate">{reward.name}</h4>
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold uppercase tracking-wider flex-shrink-0">
                          {rewardTypeLabels[reward.reward_type]}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${reward.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {reward.is_active ? "Disponible" : "No disponible"}
                        </span>
                      </div>
                      {reward.description && (
                        <p className="text-xs text-gray-500 mb-1 truncate">{reward.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                        <span className="font-semibold text-[#1C1C28]">
                          <Star className="inline w-3 h-3 mr-1 text-amber-500" />
                          {reward.points_cost} puntos
                        </span>
                        {reward.reward_value && <span>{reward.reward_value}</span>}
                        {reward.stock_quantity && <span>Stock: {reward.current_stock} / {reward.stock_quantity}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                    <Switch
                      checked={reward.is_active}
                      onCheckedChange={(checked) => handleToggleReward(reward.id, checked)}
                      className="data-[state=checked]:bg-[#D1F366]"
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-2 text-gray-400 hover:text-gray-700 transition-colors rounded-lg hover:bg-gray-100">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl">
                        <DropdownMenuItem onClick={() => handleToggleReward(reward.id, !reward.is_active)}>
                          {reward.is_active ? (<><Pause className="mr-2 h-4 w-4" />Desactivar</>) : (<><Play className="mr-2 h-4 w-4" />Activar</>)}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteReward(reward.id)} className="text-red-500 focus:text-red-500">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="flex-1 overflow-y-auto hide-scrollbar mt-0">
          <div className="bg-white rounded-3xl border border-gray-100 p-8">
            <h3 className="font-bold text-lg text-gray-900 mb-6">Configuración del Sistema de Puntos</h3>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="points-per-euro" className="text-sm font-semibold text-gray-700">Puntos por Euro Gastado</Label>
                <Input id="points-per-euro" type="number" min="1" defaultValue="1" className="rounded-xl border-gray-200" />
                <p className="text-xs text-gray-400">Cuántos puntos gana el cliente por cada euro gastado</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="points-expiry" className="text-sm font-semibold text-gray-700">Caducidad de Puntos (días)</Label>
                <Input id="points-expiry" type="number" min="30" defaultValue="365" className="rounded-xl border-gray-200" />
                <p className="text-xs text-gray-400">Días hasta que los puntos caduquen</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <Label htmlFor="welcome-points" className="text-sm font-semibold text-gray-700">Puntos de Bienvenida</Label>
              <Input id="welcome-points" type="number" min="0" defaultValue="100" className="rounded-xl border-gray-200" />
              <p className="text-xs text-gray-400">Puntos que recibe un cliente al registrarse</p>
            </div>
            <button className="mt-6 px-6 py-3 bg-[#D1F366] text-[#1C1C28] rounded-xl font-bold text-sm hover:bg-[#B3D93C] transition-colors">
              Guardar Configuración
            </button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Promotion Dialog */}
      <Dialog open={isPromotionDialogOpen} onOpenChange={setIsPromotionDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Crear Nueva Promoción</DialogTitle>
            <DialogDescription>Configura una promoción para atraer y fidelizar clientes</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreatePromotion}>
            <div className="grid gap-5 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="promo-name" className="font-semibold">Nombre de la Promoción *</Label>
                <Input id="promo-name" value={promotionForm.name} onChange={(e) => setPromotionForm({ ...promotionForm, name: e.target.value })} placeholder="20% de descuento en toda la tienda" required className="rounded-xl" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="promo-description" className="font-semibold">Descripción</Label>
                <Textarea id="promo-description" value={promotionForm.description} onChange={(e) => setPromotionForm({ ...promotionForm, description: e.target.value })} placeholder="Describe los términos y condiciones de la promoción" rows={3} className="rounded-xl" />
              </div>

              <div className="flex flex-col gap-2">
                <Label className="font-semibold">Imagen (opcional)</Label>
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={() => setImageUploadMethod("url")} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${imageUploadMethod === "url" ? "bg-[#D1F366] text-[#1C1C28]" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>URL</button>
                  <button type="button" onClick={() => setImageUploadMethod("upload")} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${imageUploadMethod === "upload" ? "bg-[#D1F366] text-[#1C1C28]" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Subir archivo</button>
                </div>
                {imageUploadMethod === "url" ? (
                  <Input type="url" placeholder="https://ejemplo.com/imagen.jpg" value={promotionForm.image_url} onChange={(e) => setPromotionForm((prev) => ({ ...prev, image_url: e.target.value }))} className="rounded-xl" />
                ) : (
                  <div className="flex flex-col gap-2">
                    <Input type="file" accept="image/*" onChange={handleImageUpload} disabled={isUploading} className="rounded-xl" />
                    {isUploading && (<div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Subiendo imagen...</div>)}
                    <p className="text-xs text-gray-400">Formatos: JPG, PNG, GIF, WebP. Máximo 5MB.</p>
                  </div>
                )}
                {promotionForm.image_url && (
                  <div className="mt-2 relative inline-block">
                    <img src={promotionForm.image_url} alt="Preview" className="w-24 h-24 object-cover rounded-xl border" onError={(e) => { ;(e.target as HTMLImageElement).style.display = "none" }} />
                    <button type="button" onClick={() => setPromotionForm((prev) => ({ ...prev, image_url: "" }))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="max-uses" className="font-semibold">Máximo de Usos</Label>
                <Input id="max-uses" type="number" min="1" value={promotionForm.max_uses} onChange={(e) => setPromotionForm({ ...promotionForm, max_uses: e.target.value })} placeholder="Ilimitado" className="rounded-xl" />
              </div>

              <div className="grid gap-4 grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="start-date" className="font-semibold">Fecha de Inicio *</Label>
                  <Input id="start-date" type="datetime-local" value={promotionForm.start_date} onChange={(e) => setPromotionForm({ ...promotionForm, start_date: e.target.value })} required className="rounded-xl" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="end-date" className="font-semibold">Fecha de Fin *</Label>
                  <Input id="end-date" type="datetime-local" value={promotionForm.end_date} onChange={(e) => setPromotionForm({ ...promotionForm, end_date: e.target.value })} required className="rounded-xl" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch id="promo-active" checked={promotionForm.is_active} onCheckedChange={(checked) => setPromotionForm({ ...promotionForm, is_active: checked })} className="data-[state=checked]:bg-[#D1F366]" />
                <Label htmlFor="promo-active" className="font-medium text-gray-700">Activar promoción inmediatamente</Label>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setIsPromotionDialogOpen(false)} className="rounded-xl">Cancelar</Button>
              <button type="submit" disabled={isLoading} className="px-6 py-2.5 bg-[#D1F366] text-[#1C1C28] rounded-xl font-bold text-sm hover:bg-[#B3D93C] transition-colors disabled:opacity-60">
                {isLoading ? "Creando..." : "Crear Promoción"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Reward Dialog */}
      <Dialog open={isRewardDialogOpen} onOpenChange={setIsRewardDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Crear Nueva Recompensa</DialogTitle>
            <DialogDescription>Añade una recompensa que los clientes puedan canjear con puntos</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateReward}>
            <div className="grid gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="reward-name" className="font-semibold">Nombre de la Recompensa *</Label>
                <Input id="reward-name" value={rewardForm.name} onChange={(e) => setRewardForm({ ...rewardForm, name: e.target.value })} placeholder="Café gratis" required className="rounded-xl" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reward-description" className="font-semibold">Descripción</Label>
                <Textarea id="reward-description" value={rewardForm.description} onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })} placeholder="Describe la recompensa y sus condiciones" rows={2} className="rounded-xl" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="points-cost" className="font-semibold">Costo en Puntos *</Label>
                <Input id="points-cost" type="number" min="1" value={rewardForm.points_cost} onChange={(e) => setRewardForm({ ...rewardForm, points_cost: Number.parseInt(e.target.value) || 0 })} required className="rounded-xl" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reward-type" className="font-semibold">Tipo de Recompensa *</Label>
                <Select value={rewardForm.reward_type} onValueChange={(value: "discount" | "free_item" | "service" | "gift") => setRewardForm({ ...rewardForm, reward_type: value })}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecciona el tipo" /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="discount">Descuento</SelectItem>
                    <SelectItem value="free_item">Producto Gratis</SelectItem>
                    <SelectItem value="service">Servicio</SelectItem>
                    <SelectItem value="gift">Regalo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reward-value" className="font-semibold">Valor/Detalles</Label>
                <Input id="reward-value" value={rewardForm.reward_value} onChange={(e) => setRewardForm({ ...rewardForm, reward_value: e.target.value })} placeholder="10% descuento, Café americano, etc." className="rounded-xl" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="stock" className="font-semibold">Stock Disponible</Label>
                <Input id="stock" type="number" min="1" value={rewardForm.stock_quantity} onChange={(e) => setRewardForm({ ...rewardForm, stock_quantity: e.target.value })} placeholder="Ilimitado" className="rounded-xl" />
              </div>
              <div className="flex items-center gap-3">
                <Switch id="reward-active" checked={rewardForm.is_active} onCheckedChange={(checked) => setRewardForm({ ...rewardForm, is_active: checked })} className="data-[state=checked]:bg-[#D1F366]" />
                <Label htmlFor="reward-active" className="font-medium text-gray-700">Recompensa disponible</Label>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setIsRewardDialogOpen(false)} className="rounded-xl">Cancelar</Button>
              <button type="submit" disabled={isLoading} className="px-6 py-2.5 bg-[#D1F366] text-[#1C1C28] rounded-xl font-bold text-sm hover:bg-[#B3D93C] transition-colors disabled:opacity-60">
                {isLoading ? "Creando..." : "Crear Recompensa"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
