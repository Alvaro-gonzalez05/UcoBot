"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Loader2, X, Upload, Image as ImageIcon } from "lucide-react"
import { toast } from "sonner"
import { ProductRecipeEditor } from "./product-recipe-editor"

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

interface ProductEditFormProps {
  product: Product
  onProductUpdated: () => void
  onClose: () => void
  existingCategories: string[]
  isOpen: boolean
}

export function ProductEditForm({ 
  product, 
  onProductUpdated, 
  onClose, 
  existingCategories,
  isOpen 
}: ProductEditFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [formData, setFormData] = useState({
    name: product.name,
    description: product.description || "",
    price: product.price.toString(),
    category: product.category || "",
    is_available: product.is_available,
    image_url: product.image_url || ""
  })
  const [newCategory, setNewCategory] = useState("")
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [imageUploadMethod, setImageUploadMethod] = useState<"url" | "upload">("url")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Use new category if provided, otherwise use selected category
      const categoryToUse = newCategory.trim() || formData.category

      const response = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          category: categoryToUse,
          price: parseFloat(formData.price),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Error al actualizar producto")
      }

      toast.success("Producto actualizado exitosamente")
      onProductUpdated()
      onClose()

    } catch (error) {
      console.error("Error updating product:", error)
      toast.error(error instanceof Error ? error.message : "Error al actualizar producto")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCategoryChange = (value: string) => {
    if (value === "new") {
      setShowNewCategoryInput(true)
      setFormData(prev => ({ ...prev, category: "" }))
    } else {
      setShowNewCategoryInput(false)
      setNewCategory("")
      setFormData(prev => ({ ...prev, category: value }))
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast.error("Formato no soportado. Usa JPG, PNG, GIF o WebP")
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("El archivo es muy grande. Máximo 5MB permitido")
      return
    }

    setIsUploading(true)
    toast.loading("Subiendo imagen...", { id: "upload-image" })

    try {
      const formDataUpload = new FormData()
      formDataUpload.append('file', file)

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formDataUpload,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Error al subir imagen")
      }

      setFormData(prev => ({ ...prev, image_url: result.url }))
      toast.success("Imagen subida exitosamente", { id: "upload-image" })

    } catch (error) {
      console.error("Error uploading image:", error)
      toast.error(error instanceof Error ? error.message : "Error al subir imagen", { id: "upload-image" })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Producto</DialogTitle>
          <DialogDescription>
            Actualiza la información del producto
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre del producto *</Label>
              <Input
                id="edit-name"
                placeholder="Ej: Hamburguesa Clásica"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-price">Precio *</Label>
              <NumberInput
                id="edit-price"
                placeholder="0"
                value={formData.price === "" ? null : Number(formData.price)}
                onValueChange={(v) => setFormData(prev => ({ ...prev, price: v == null ? "" : String(v) }))}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-category">Categoría</Label>
            {!showNewCategoryInput ? (
              <Select onValueChange={handleCategoryChange} value={formData.category}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona o crea una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {existingCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                  <SelectItem value="new">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Crear nueva categoría
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Nombre de la nueva categoría"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowNewCategoryInput(false)
                    setNewCategory("")
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Descripción</Label>
            <Textarea
              id="edit-description"
              placeholder="Describe tu producto..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Imagen del producto</Label>
            <Tabs value={imageUploadMethod} onValueChange={(value) => setImageUploadMethod(value as "url" | "upload")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="url">URL</TabsTrigger>
                <TabsTrigger value="upload">Subir archivo</TabsTrigger>
              </TabsList>
              
              <TabsContent value="url" className="space-y-2">
                <Input
                  type="url"
                  placeholder="https://ejemplo.com/imagen.jpg"
                  value={formData.image_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                />
              </TabsContent>
              
              <TabsContent value="upload" className="space-y-2">
                <div className="flex flex-col gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={isUploading}
                  />
                  {isUploading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Subiendo imagen...
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Formatos: JPG, PNG, GIF, WebP. Máximo 5MB. Se almacena en Supabase Storage.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
            
            {formData.image_url && (
              <div className="mt-2">
                <img 
                  src={formData.image_url} 
                  alt="Preview" 
                  className="w-24 h-24 object-cover rounded border"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
            )}
          </div>

          <ProductRecipeEditor productId={product.id} />

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Switch
                id="edit-is_available"
                checked={formData.is_available}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, is_available: checked }))
                }
              />
              <Label htmlFor="edit-is_available">Disponible para pedidos</Label>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isLoading || isUploading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isLoading || isUploading || !formData.name || !formData.price}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Actualizando...
                </>
              ) : (
                "Actualizar Producto"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}