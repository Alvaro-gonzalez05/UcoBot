"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { 
  Plus, 
  Package, 
  Edit, 
  Trash2, 
  MoreHorizontal,
  Eye,
  EyeOff,
  ShoppingCart,
  DollarSign,
  Tag
} from "lucide-react"
import { ScrollFadeIn, ScrollSlideUp, ScrollStaggeredChildren, ScrollStaggerChild } from "@/components/ui/scroll-animations"
import { motion } from "framer-motion"

interface Product {
  id: string
  name: string
  description?: string
  price: number
  category?: string
  is_available: boolean
  image_url?: string
  metadata?: any
  created_at: string
  updated_at: string
}

interface Bot {
  id: string
  name: string
  features: string[]
}

interface ProductsManagementProps {
  initialProducts: Product[]
  userId: string
  botsWithOrders: Bot[]
}

export function ProductsManagement({ initialProducts, userId, botsWithOrders }: ProductsManagementProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    category: "",
    is_service: false,
    duration_min: "",
    is_available: true,
    image_url: "",
  })

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      price: "",
      category: "",
      is_available: true,
      image_url: "",
    })
  }

  // Check if user has bots with order-taking capability
  if (botsWithOrders.length === 0) {
    return (
      <div className="space-y-6">
        <ScrollSlideUp>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Gestión de Productos</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Administra los productos de tu negocio</p>
          </div>
        </ScrollSlideUp>

        <ScrollFadeIn delay={0.2}>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <ShoppingCart className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-base font-medium text-amber-800">Función no habilitada</h4>
                  <p className="text-sm text-amber-700 mt-1">
                    Para gestionar productos, necesitas tener al menos un bot con la función "Tomar pedidos" habilitada.
                  </p>
                  <p className="text-xs text-amber-600 mt-2">
                    Ve a la sección "Bots" y edita o crea un bot habilitando la función "Tomar pedidos".
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </ScrollFadeIn>
      </div>
    )
  }

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { data, error } = await supabase
        .from("products")
        .insert([{
          ...formData,
          price: parseFloat(formData.price),
          duration_min: formData.is_service ? (formData.duration_min ? parseInt(formData.duration_min) : 30) : null,
          user_id: userId,
        }])
        .select()
        .single()

      if (error) throw error

      setProducts([data, ...products])
      setIsCreateDialogOpen(false)
      resetForm()
      toast.success("Producto creado exitosamente", {
        description: `${data.name} ha sido agregado al catálogo.`,
        duration: 4000,
      })
    } catch (error) {
      toast.error("Error al crear producto", {
        description: "No se pudo crear el producto. Inténtalo de nuevo.",
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct) return

    setIsLoading(true)

    try {
      const { data, error } = await supabase
        .from("products")
        .update({
          ...formData,
          price: parseFloat(formData.price),
          duration_min: formData.is_service ? (formData.duration_min ? parseInt(formData.duration_min) : 30) : null,
        })
        .eq("id", selectedProduct.id)
        .select()
        .single()

      if (error) throw error

      setProducts(products.map((product) => (product.id === selectedProduct.id ? data : product)))
      setIsEditDialogOpen(false)
      setSelectedProduct(null)
      resetForm()
      toast.success("Producto actualizado", {
        description: `${data.name} ha sido actualizado exitosamente.`,
        duration: 4000,
      })
    } catch (error) {
      toast.error("Error al actualizar producto", {
        description: "No se pudo actualizar el producto. Inténtalo de nuevo.",
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleAvailability = async (productId: string, isAvailable: boolean) => {
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_available: isAvailable })
        .eq("id", productId)

      if (error) throw error

      setProducts(products.map((product) => 
        product.id === productId ? { ...product, is_available: isAvailable } : product
      ))
      
      const productName = products.find(p => p.id === productId)?.name || "Producto"
      toast.success(
        isAvailable ? "Producto habilitado" : "Producto deshabilitado",
        {
          description: `${productName} ${isAvailable ? 'está ahora disponible' : 'ha sido marcado como no disponible'}.`,
          duration: 4000,
        }
      )
    } catch (error) {
      toast.error("Error al cambiar disponibilidad", {
        description: "No se pudo cambiar la disponibilidad del producto.",
        duration: 4000,
      })
    }
  }

  const handleDeleteProduct = async (productId: string) => {
    try {
      const { error } = await supabase.from("products").delete().eq("id", productId)

      if (error) throw error

      setProducts(products.filter((product) => product.id !== productId))
      const productName = products.find(p => p.id === productId)?.name || "Producto"
      toast.success("Producto eliminado", {
        description: `${productName} ha sido eliminado del catálogo.`,
        duration: 4000,
      })
    } catch (error) {
      toast.error("Error al eliminar producto", {
        description: "No se pudo eliminar el producto. Inténtalo de nuevo.",
        duration: 4000,
      })
    }
  }

  const openEditDialog = (product: Product) => {
    setSelectedProduct(product)
    setFormData({
      name: product.name,
      description: product.description || "",
      price: product.price.toString(),
      category: product.category || "",
      is_service: !!(product as any).is_service,
      duration_min: (product as any).duration_min ? String((product as any).duration_min) : "",
      is_available: product.is_available,
      image_url: product.image_url || "",
    })
    setIsEditDialogOpen(true)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-ES")
  }

  // Group products by category
  const productsByCategory = products.reduce((acc, product) => {
    const category = product.category || 'Sin categoría'
    if (!acc[category]) acc[category] = []
    acc[category].push(product)
    return acc
  }, {} as Record<string, Product[]>)

  const categories = Object.keys(productsByCategory)

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <ScrollSlideUp>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Gestión de Productos</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Administra el catálogo de productos para tus bots con pedidos
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {products.length} productos • Habilitado en {botsWithOrders.length} bot(s)
            </p>
          </div>
        </ScrollSlideUp>
        <ScrollFadeIn delay={0.2}>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Agregar Producto</span>
                  <span className="sm:hidden">Nuevo</span>
                </Button>
              </motion.div>
            </DialogTrigger>
          </Dialog>
        </ScrollFadeIn>
      </div>

      {/* Products Grid */}
      <ScrollStaggeredChildren className="space-y-6">
        {products.length === 0 ? (
          <ScrollStaggerChild>
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No hay productos aún</h3>
                <p className="text-sm text-muted-foreground text-center mb-4">
                  Comienza agregando productos a tu catálogo para que tus bots puedan tomar pedidos
                </p>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar mi primer producto
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          </ScrollStaggerChild>
        ) : (
          categories.map((category) => (
            <ScrollStaggerChild key={category}>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">{category}</h2>
                  <Badge variant="secondary">{productsByCategory[category].length}</Badge>
                </div>
                
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {productsByCategory[category].map((product) => (
                    <motion.div
                      key={product.id}
                      whileHover={{ scale: 1.02, y: -2 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <CardTitle className="text-base">{product.name}</CardTitle>
                              <div className="flex items-center gap-2">
                                <DollarSign className="h-4 w-4 text-green-600" />
                                <span className="font-semibold text-green-600">
                                  ${product.price.toFixed(2)}
                                </span>
                                <Badge variant={product.is_available ? "default" : "secondary"}>
                                  {product.is_available ? "Disponible" : "No disponible"}
                                </Badge>
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditDialog(product)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleToggleAvailability(product.id, !product.is_available)}
                                >
                                  {product.is_available ? (
                                    <EyeOff className="h-4 w-4 mr-2" />
                                  ) : (
                                    <Eye className="h-4 w-4 mr-2" />
                                  )}
                                  {product.is_available ? "Deshabilitar" : "Habilitar"}
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleDeleteProduct(product.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        {product.description && (
                          <CardContent className="pt-0">
                            <p className="text-sm text-muted-foreground">{product.description}</p>
                            <div className="text-xs text-muted-foreground mt-2">
                              Agregado el {formatDate(product.created_at)}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            </ScrollStaggerChild>
          ))
        )}
      </ScrollStaggeredChildren>

      {/* Create Product Dialog */}
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Agregar Nuevo Producto</DialogTitle>
          <DialogDescription>
            Agrega un producto a tu catálogo para que tus bots puedan ofrecerlo
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreateProduct}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre del producto *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Pizza Margherita"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="price">Precio *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">Categoría</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Ej: Pizzas, Bebidas, Postres"
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_service"
                  checked={formData.is_service}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_service: checked })}
                />
                <Label htmlFor="is_service">Es un servicio (se agenda como turno)</Label>
              </div>
              {formData.is_service && (
                <div className="grid gap-1.5 mt-1">
                  <Label htmlFor="duration_min">Duración (minutos)</Label>
                  <Input
                    id="duration_min"
                    type="number"
                    min="5"
                    step="5"
                    value={formData.duration_min}
                    onChange={(e) => setFormData({ ...formData, duration_min: e.target.value })}
                    placeholder="30 (default si lo dejás vacío)"
                  />
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe el producto..."
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="image_url">URL de imagen (opcional)</Label>
              <Input
                id="image_url"
                type="url"
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                placeholder="https://ejemplo.com/imagen.jpg"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="is_available"
                checked={formData.is_available}
                onCheckedChange={(checked) => setFormData({ ...formData, is_available: checked })}
              />
              <Label htmlFor="is_available">Producto disponible</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creando..." : "Crear Producto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      {/* Edit Product Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Producto</DialogTitle>
            <DialogDescription>
              Actualiza la información del producto
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditProduct}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Nombre del producto *</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-price">Precio *</Label>
                <Input
                  id="edit-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-category">Categoría</Label>
                <Input
                  id="edit-category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="edit-is_service"
                    checked={formData.is_service}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_service: checked })}
                  />
                  <Label htmlFor="edit-is_service">Es un servicio (se agenda como turno)</Label>
                </div>
                {formData.is_service && (
                  <div className="grid gap-1.5 mt-1">
                    <Label htmlFor="edit-duration_min">Duración (minutos)</Label>
                    <Input
                      id="edit-duration_min"
                      type="number"
                      min="5"
                      step="5"
                      value={formData.duration_min}
                      onChange={(e) => setFormData({ ...formData, duration_min: e.target.value })}
                      placeholder="30 (default si lo dejás vacío)"
                    />
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-description">Descripción</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-image_url">URL de imagen (opcional)</Label>
                <Input
                  id="edit-image_url"
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-is_available"
                  checked={formData.is_available}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_available: checked })}
                />
                <Label htmlFor="edit-is_available">Producto disponible</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Actualizando..." : "Actualizar Producto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}