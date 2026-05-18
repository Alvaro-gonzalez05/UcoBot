"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Plus, MoreHorizontal, Edit, Trash2, Users, Gift, Calendar, Phone, Mail, Instagram } from "lucide-react"
import { ScrollFadeIn, ScrollSlideUp, ScrollStaggeredChildren, ScrollStaggerChild, ScrollScaleIn } from "@/components/ui/scroll-animations"
import { motion } from "framer-motion"
import { ClientsPagination } from "./clients-pagination"
import { DemoBlocker } from "@/components/ui/demo-blocker"
import { ClientsSearch } from "./clients-search"

interface Client {
  id: string
  name: string
  phone?: string
  email?: string
  instagram?: string
  instagram_username?: string
  birthday?: string
  points: number
  total_purchases: number
  last_purchase_date?: string
  created_at: string
}

interface ClientsManagementProps {
  initialClients: Client[]
  userId: string
  pagination: {
    page: number
    limit: number
    totalItems: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
  searchTerm: string
  demo?: boolean
}

export function ClientsManagement({ initialClients, userId, pagination, searchTerm, demo = false }: ClientsManagementProps) {
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  // Update clients when initialClients change (when navigating pages)
  useEffect(() => {
    setClients(initialClients)
  }, [initialClients])

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    instagram: "",
    instagram_username: "",
    birthday: "",
    points: 0,
  })

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      email: "",
      instagram: "",
      instagram_username: "",
      birthday: "",
      points: 0,
    })
  }

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    // Prepare data with default name if empty
    const clientData = {
      ...formData,
      birthday: formData.birthday ? formData.birthday : null,
      name: formData.name.trim() || "Cliente sin nombre",
      user_id: userId,
      total_purchases: 0,
    }

    try {
      const { data, error } = await supabase
        .from("clients")
        .insert([clientData])
        .select()
        .single()

      if (error) throw error

      // If we're on the first page, add the client to the current list
      if (pagination.page === 1) {
        setClients([data, ...clients.slice(0, pagination.limit - 1)])
      }
      
      setIsAddDialogOpen(false)
      resetForm()
      toast.success("Cliente añadido exitosamente", {
        description: `${formData.name} ha sido añadido a tu lista de clientes.`,
        duration: 4000,
      })

      // Refresh the page to get updated pagination info
      window.location.reload()
    } catch (error) {
      toast.error("Error al añadir cliente", {
        description: "No se pudo añadir el cliente. Inténtalo de nuevo.",
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClient) return

    setIsLoading(true)

    try {
      const { data, error } = await supabase
        .from("clients")
        .update({
          ...formData,
          birthday: formData.birthday ? formData.birthday : null
        })
        .eq("id", selectedClient.id)
        .select()
        .single()

      if (error) throw error

      setClients(clients.map((client) => (client.id === selectedClient.id ? data : client)))
      setIsEditDialogOpen(false)
      setSelectedClient(null)
      resetForm()
      toast.success("Cliente actualizado", {
        description: `Los datos de ${data.name} han sido actualizados exitosamente.`,
        duration: 4000,
      })
    } catch (error) {
      toast.error("Error al actualizar cliente", {
        description: "No se pudo actualizar el cliente. Inténtalo de nuevo.",
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteClient = async (clientId: string) => {
    try {
      const { error } = await supabase.from("clients").delete().eq("id", clientId)

      if (error) throw error

      const clientName = clients.find(c => c.id === clientId)?.name || "Cliente"
      setClients(clients.filter((client) => client.id !== clientId))
      toast.success("Cliente eliminado", {
        description: `${clientName} ha sido eliminado exitosamente.`,
        duration: 4000,
      })

      // If the current page becomes empty, refresh to redirect to appropriate page
      if (clients.length === 1 && pagination.page > 1) {
        window.location.reload()
      }
    } catch (error) {
      toast.error("Error al eliminar cliente", {
        description: "No se pudo eliminar el cliente. Inténtalo de nuevo.",
        duration: 4000,
      })
    }
  }

  const openEditDialog = (client: Client) => {
    setSelectedClient(client)
    setFormData({
      name: client.name,
      phone: client.phone || "",
      email: client.email || "",
      instagram: client.instagram || "",
      instagram_username: client.instagram_username || "",
      birthday: client.birthday || "",
      points: client.points,
    })
    setIsEditDialogOpen(true)
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-"
    // Si es una fecha completa con hora (ISO), usar Date
    if (dateString.includes('T')) {
      return new Date(dateString).toLocaleDateString("es-ES")
    }
    // Si es solo fecha YYYY-MM-DD, parsear manualmente para evitar problemas de zona horaria
    const [year, month, day] = dateString.split('-')
    return `${day}/${month}/${year}`
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <ScrollSlideUp>
          <div>
            <h1 className="text-3xl font-bold">Gestión de Clientes</h1>
            <p className="text-muted-foreground">Administra tu base de clientes y sistema de puntos</p>
          </div>
        </ScrollSlideUp>
        <ScrollFadeIn delay={0.2}>
          {demo ? (
            <DemoBlocker>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Añadir Cliente
              </Button>
            </DemoBlocker>
          ) : null}
          <Dialog open={demo ? false : isAddDialogOpen} onOpenChange={demo ? undefined : setIsAddDialogOpen}>
            {!demo && (
            <DialogTrigger asChild>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Añadir Cliente
                </Button>
              </motion.div>
            </DialogTrigger>
            )}
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Añadir Nuevo Cliente</DialogTitle>
              <DialogDescription>
                Completa la información del cliente. Los campos marcados son opcionales.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddClient}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="instagram">Instagram</Label>
                  <Input
                    id="instagram"
                    value={formData.instagram}
                    onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                    placeholder="@usuario"
                  />
                  <p className="text-xs text-muted-foreground">
                    Para clientes de Instagram, el username se obtiene automáticamente
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="birthday">Cumpleaños</Label>
                  <Input
                    id="birthday"
                    type="date"
                    value={formData.birthday}
                    onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="points">Puntos Iniciales</Label>
                  <Input
                    id="points"
                    type="number"
                    min="0"
                    value={formData.points}
                    onChange={(e) => setFormData({ ...formData, points: Number.parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <DialogFooter>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancelar
                  </Button>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Añadiendo..." : "Añadir Cliente"}
                  </Button>
                </motion.div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </ScrollFadeIn>
      </div>

      {/* Stats Cards */}
      <ScrollStaggeredChildren className="grid gap-4 md:grid-cols-3">
        <ScrollStaggerChild>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <ScrollScaleIn delay={0.3}>
                <div className="text-2xl font-bold">{pagination.totalItems}</div>
              </ScrollScaleIn>
              <p className="text-xs text-muted-foreground">Clientes registrados</p>
            </CardContent>
          </Card>
        </ScrollStaggerChild>

        <ScrollStaggerChild>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Puntos Totales</CardTitle>
              <Gift className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <ScrollScaleIn delay={0.4}>
                <div className="text-2xl font-bold">{clients.reduce((sum, client) => sum + client.points, 0)}</div>
              </ScrollScaleIn>
              <p className="text-xs text-muted-foreground">Puntos acumulados</p>
            </CardContent>
          </Card>
        </ScrollStaggerChild>

        <ScrollStaggerChild>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ventas Totales</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <ScrollScaleIn delay={0.5}>
                <div className="text-2xl font-bold">
                  {formatCurrency(clients.reduce((sum, client) => sum + client.total_purchases, 0))}
                </div>
              </ScrollScaleIn>
              <p className="text-xs text-muted-foreground">Ingresos generados</p>
            </CardContent>
          </Card>
        </ScrollStaggerChild>
      </ScrollStaggeredChildren>

      {/* Search and Filters */}
      <ScrollFadeIn delay={0.4}>
        <Card>
        <CardHeader>
          <CardTitle>Lista de Clientes</CardTitle>
          <CardDescription>Busca y gestiona todos tus clientes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-4">
            <ClientsSearch defaultValue={searchTerm} />
          </div>

          {/* Clients Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Puntos</TableHead>
                  <TableHead>Compras</TableHead>
                  <TableHead>Última Compra</TableHead>
                  <TableHead>Cumpleaños</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex flex-col items-center space-y-2">
                        <Users className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {searchTerm ? "No se encontraron clientes" : "No tienes clientes aún"}
                        </p>
                        {!searchTerm && (
                          <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Button onClick={() => setIsAddDialogOpen(true)}>Añadir tu primer cliente</Button>
                          </motion.div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client, index) => (
                    <motion.tr
                      key={client.id}
                      className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.3 }}
                      whileHover={{ backgroundColor: "rgba(0,0,0,0.02)" }}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{client.name}</div>
                          <div className="text-sm text-muted-foreground">
                            Cliente desde {formatDate(client.created_at)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {client.phone && (
                            <a 
                              href={`https://wa.me/${client.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center text-sm hover:text-green-600 transition-colors cursor-pointer"
                              title="Abrir en WhatsApp"
                            >
                              <Phone className="h-3 w-3 mr-1" />
                              {client.phone}
                            </a>
                          )}
                          {client.email && (
                            <a
                              href={`mailto:${client.email}`}
                              className="flex items-center text-sm hover:text-blue-600 transition-colors cursor-pointer"
                              title="Enviar email"
                            >
                              <Mail className="h-3 w-3 mr-1" />
                              {client.email}
                            </a>
                          )}
                          {(client.instagram_username || client.instagram) && (
                            <a
                              href={
                                client.instagram_username 
                                  ? `https://instagram.com/${client.instagram_username}` 
                                  : client.instagram 
                                    ? `https://instagram.com/${client.instagram.replace(/^@/, '')}` 
                                    : "https://instagram.com"
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center text-sm hover:text-pink-600 transition-colors cursor-pointer"
                              title="Ver perfil de Instagram"
                            >
                              <Instagram className="h-3 w-3 mr-1" />
                              {client.instagram_username ? `@${client.instagram_username}` : client.instagram}
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{client.points} pts</Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(client.total_purchases)}</TableCell>
                      <TableCell>{formatDate(client.last_purchase_date)}</TableCell>
                      <TableCell>{formatDate(client.birthday)}</TableCell>
                      <TableCell>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <motion.div
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </motion.div>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={demo ? undefined : () => openEditDialog(client)}
                              disabled={demo}
                              title={demo ? "Activá tu cuenta para empezar a usar" : undefined}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={demo ? undefined : () => handleDeleteClient(client.id)}
                              disabled={demo}
                              title={demo ? "Activá tu cuenta para empezar a usar" : undefined}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </motion.tr>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <ClientsPagination 
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            itemsPerPage={pagination.limit}
          />
        </CardContent>
        </Card>
      </ScrollFadeIn>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>Actualiza la información del cliente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditClient}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Nombre *</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Teléfono</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-instagram">Instagram Username</Label>
                <Input
                  id="edit-instagram"
                  value={formData.instagram_username ? `@${formData.instagram_username}` : formData.instagram}
                  onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                  placeholder="@usuario"
                  readOnly={!!formData.instagram_username}
                  className={formData.instagram_username ? "bg-muted" : ""}
                />
                {formData.instagram_username && (
                  <p className="text-xs text-muted-foreground">
                    Username obtenido automáticamente desde Instagram
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-birthday">Cumpleaños</Label>
                <Input
                  id="edit-birthday"
                  type="date"
                  value={formData.birthday}
                  onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-points">Puntos</Label>
                <Input
                  id="edit-points"
                  type="number"
                  min="0"
                  value={formData.points}
                  onChange={(e) => setFormData({ ...formData, points: Number.parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <DialogFooter>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancelar
                </Button>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Actualizando..." : "Actualizar Cliente"}
                </Button>
              </motion.div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
