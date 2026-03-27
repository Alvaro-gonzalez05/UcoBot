"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Calendar, Clock, Users, Phone, Eye, MoreHorizontal, Edit, Trash, Filter, X, ChevronLeft, ChevronRight, Store, Tag, CheckCircle, CalendarClock } from "lucide-react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isSameMonth, addMonths, subMonths } from "date-fns"
import { es } from "date-fns/locale"
import { DashboardPagination } from "./dashboard-pagination"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Reservation {
  id: string
  customer_name: string
  customer_phone: string
  reservation_date: string
  reservation_time: string
  party_size: number
  status: string
  table_number?: string
  special_requests?: string
  tags?: string[]
  conversation?: {
    platform?: string
  }
}

interface ReservasClientProps {
  reservations: Reservation[]
  pagination: {
    page: number
    limit: number
    totalItems: number
    totalPages: number
  }
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
}

const INITIALS_COLORS = [
  "bg-indigo-100 text-indigo-600",
  "bg-rose-100 text-rose-600",
  "bg-amber-100 text-amber-600",
  "bg-teal-100 text-teal-600",
  "bg-violet-100 text-violet-600",
]

function getInitialColor(name: string) {
  const idx = name.charCodeAt(0) % INITIALS_COLORS.length
  return INITIALS_COLORS[idx]
}

export function ReservasClient({ reservations, pagination }: ReservasClientProps) {
  const supabase = createClient()
  const router = useRouter()
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  // Calendar data
  const monthStart = startOfMonth(calendarMonth)
  const monthEnd = endOfMonth(calendarMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
  // Monday-first: 0=Mon ... 6=Sun — getDay returns 0=Sun so we offset
  const startOffset = (getDay(monthStart) + 6) % 7

  // Dates that have reservations
  const reservationDates = useMemo(() =>
    new Set(reservations.map(r => r.reservation_date)),
    [reservations]
  )

  // Extract unique tags
  const allTags = Array.from(new Set(reservations.flatMap(r => r.tags || []))).sort()

  // Combined filter: tags + selected date
  const filteredReservations = reservations.filter(reservation => {
    const tagMatch = selectedTags.length === 0 || (reservation.tags && selectedTags.every(t => reservation.tags!.includes(t)))
    const dateMatch = !selectedDate || reservation.reservation_date === format(selectedDate, "yyyy-MM-dd")
    return tagMatch && dateMatch
  })

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const handleQuickConfirm = async (reservation: Reservation) => {
    if (reservation.status === 'confirmed') return
    setIsLoading(true)
    try {
      const { error } = await supabase.from("reservations").update({ status: "confirmed" }).eq("id", reservation.id)
      if (error) throw error
      toast.success("Reserva confirmada correctamente.")
      router.refresh()
    } catch {
      toast.error("No se pudo confirmar la reserva.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = (id: string) => {
    toast("¿Estás seguro de eliminar esta reserva?", {
      description: "Esta acción no se puede deshacer.",
      action: { label: "Eliminar", onClick: () => performDelete(id) },
    })
  }

  const performDelete = async (id: string) => {
    setIsLoading(true)
    try {
      const { error } = await supabase.from("reservations").delete().eq("id", id)
      if (error) throw error
      toast.success("Reserva eliminada correctamente.")
      router.refresh()
    } catch {
      toast.error("No se pudo eliminar la reserva.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (reservation: Reservation) => {
    setSelectedReservation(reservation)
    setIsEditDialogOpen(true)
  }

  const handleUpdateReservation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedReservation) return
    setIsLoading(true)
    const formData = new FormData(e.currentTarget)
    try {
      const { error } = await supabase.from("reservations").update({
        reservation_date: formData.get("date"),
        reservation_time: formData.get("time"),
        party_size: formData.get("party_size"),
        status: formData.get("status"),
        table_number: formData.get("table_number"),
      }).eq("id", selectedReservation.id)
      if (error) throw error
      toast.success("Reserva actualizada correctamente.")
      setIsEditDialogOpen(false)
      router.refresh()
    } catch {
      toast.error("No se pudo actualizar la reserva.")
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending':   return 'bg-amber-100 text-amber-700 border-amber-200'
      case 'confirmed': return 'bg-green-100 text-green-700 border-green-200'
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-200'
      case 'completed': return 'bg-blue-100 text-blue-700 border-blue-200'
      default:          return 'bg-gray-100 text-gray-600 border-gray-200'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':   return 'Pendiente'
      case 'confirmed': return 'Confirmada'
      case 'cancelled': return 'Cancelada'
      case 'completed': return 'Completada'
      default:          return status
    }
  }

  const hasActiveFilters = selectedTags.length > 0 || selectedDate !== null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="mb-6 px-1 pt-2">
        <h2 className="text-3xl font-bold dark:text-white">Gestión de Reservas</h2>
        <p className="text-muted-foreground text-sm mt-1">Administración de citas y reuniones en tiempo real.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <CalendarClock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Total Citas</p>
            <p className="text-2xl font-bold dark:text-white">{pagination.totalItems}</p>
          </div>
        </div>
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Pendientes</p>
            <p className="text-2xl font-bold dark:text-white">{reservations.filter(r => r.status === 'pending').length}</p>
          </div>
        </div>
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-green-50 dark:bg-green-900/30 text-green-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Confirmadas</p>
            <p className="text-2xl font-bold dark:text-white">{reservations.filter(r => r.status === 'confirmed').length}</p>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex gap-5 overflow-hidden">
        {/* ── Left panel ── */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto hide-scrollbar">
          {/* Mini calendar */}
          <div className="bg-card rounded-3xl p-5 shadow-sm border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm dark:text-white">
                {format(calendarMonth, "MMMM yyyy", { locale: es }).replace(/^\w/, c => c.toUpperCase())}
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground mb-2">
              {["LU","MA","MI","JU","VI","SA","DO"].map(d => <div key={d}>{d}</div>)}
            </div>
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {/* Empty cells for start offset */}
              {Array.from({ length: startOffset }).map((_, i) => <div key={`e-${i}`} />)}
              {daysInMonth.map(day => {
                const isSelected = selectedDate && isSameDay(day, selectedDate)
                const isToday = isSameDay(day, new Date())
                const hasRes = reservationDates.has(format(day, "yyyy-MM-dd"))
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(isSelected ? null : day)}
                    className={`p-2 rounded-lg transition-all relative font-medium
                      ${isSelected
                        ? "bg-[#1C1C28] text-white dark:bg-[#D1F366] dark:text-[#1C1C28]"
                        : isToday
                          ? "bg-[#D1F366]/60 text-[#1C1C28] font-bold"
                          : "hover:bg-[#D1F366] hover:text-[#1C1C28]"
                      }
                    `}
                  >
                    {format(day, "d")}
                    {hasRes && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#D1F366]" />
                    )}
                  </button>
                )
              })}
            </div>
            {selectedDate && (
              <button
                onClick={() => setSelectedDate(null)}
                className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors"
              >
                <X className="h-3 w-3" /> Ver todas las fechas
              </button>
            )}
          </div>

          {/* Tags filter */}
          <div className="bg-card rounded-3xl p-5 shadow-sm border border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm dark:text-white">Filtrar por Etiqueta</h3>
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Limpiar
                </button>
              )}
            </div>
            {allTags.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay etiquetas disponibles.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {allTags.map(tag => (
                  <label key={tag} className="flex items-center gap-3 p-2.5 rounded-xl border border-border hover:bg-muted cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tag)}
                      onChange={() => toggleTag(tag)}
                      className="w-4 h-4 rounded accent-[#D1F366]"
                    />
                    <span className="text-sm font-medium">{tag}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Status quick filter */}
            <h3 className="font-bold text-sm dark:text-white mt-4 mb-3">Estado</h3>
            <div className="flex flex-col gap-1">
              {[
                { value: 'pending', label: 'Pendientes', class: 'bg-amber-100 text-amber-700' },
                { value: 'confirmed', label: 'Confirmadas', class: 'bg-green-100 text-green-700' },
                { value: 'cancelled', label: 'Canceladas', class: 'bg-red-100 text-red-700' },
                { value: 'completed', label: 'Completadas', class: 'bg-blue-100 text-blue-700' },
              ].map(s => (
                <div key={s.value} className="flex items-center justify-between px-2 py-1.5 rounded-lg">
                  <span className="text-sm text-muted-foreground">{s.label}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.class}`}>
                    {reservations.filter(r => r.status === s.value).length}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: reservation cards ── */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 pb-4 hide-scrollbar">
          {/* Sub-header */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xl font-bold dark:text-white">
              {selectedDate
                ? format(selectedDate, "EEEE d 'de' MMMM", { locale: es }).replace(/^\w/, c => c.toUpperCase())
                : "Todas las Reservas"
              }
            </h3>
            {hasActiveFilters && (
              <button
                onClick={() => { setSelectedTags([]); setSelectedDate(null) }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <X className="h-3 w-3" /> Limpiar filtros
              </button>
            )}
          </div>

          {/* Empty state */}
          {filteredReservations.length === 0 ? (
            <div className="bg-card rounded-3xl border border-border p-12 flex flex-col items-center justify-center text-center shadow-sm">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">No hay reservas</h3>
              <p className="text-sm text-muted-foreground">
                {reservations.length === 0
                  ? "Las reservas de tus clientes aparecerán aquí automáticamente."
                  : "No hay reservas para los filtros seleccionados."}
              </p>
            </div>
          ) : (
            filteredReservations.map(reservation => (
              <div
                key={reservation.id}
                className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center justify-between gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                {/* Avatar + info */}
                <div className="flex items-center gap-5 flex-1 min-w-0">
                  <div className={`w-16 h-16 rounded-2xl flex-shrink-0 flex items-center justify-center font-bold text-xl uppercase ${getInitialColor(reservation.customer_name)}`}>
                    {getInitials(reservation.customer_name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h4 className="font-bold text-lg dark:text-white truncate">{reservation.customer_name}</h4>
                      <span className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusBadgeClass(reservation.status)}`}>
                        {getStatusText(reservation.status)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 flex-shrink-0" />
                        <span>{reservation.reservation_time}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Store className="h-4 w-4 flex-shrink-0" />
                        <span>{reservation.table_number || "Sin mesa"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 flex-shrink-0" />
                        <span>{reservation.party_size} {reservation.party_size === 1 ? "persona" : "personas"}</span>
                      </div>
                      {reservation.special_requests && (
                        <div className="flex items-center gap-1.5">
                          <Tag className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{reservation.special_requests}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 col-span-2">
                        <Calendar className="h-4 w-4 flex-shrink-0" />
                        <span>{format(new Date(reservation.reservation_date + "T12:00:00"), "dd MMM yyyy", { locale: es })}</span>
                        {reservation.tags && reservation.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 ml-2">
                            {reservation.tags.map((tag, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-medium dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* View details */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-xl">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Detalles de la Reserva</DialogTitle>
                        <DialogDescription>Información completa de la reserva</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div><Label>Cliente</Label><p className="mt-1">{reservation.customer_name}</p></div>
                          <div><Label>Teléfono</Label><p className="mt-1">{reservation.customer_phone}</p></div>
                          <div><Label>Fecha</Label><p className="mt-1">{format(new Date(reservation.reservation_date + "T12:00:00"), "dd MMMM yyyy", { locale: es })}</p></div>
                          <div><Label>Hora</Label><p className="mt-1">{reservation.reservation_time}</p></div>
                          <div><Label>Personas</Label><p className="mt-1">{reservation.party_size}</p></div>
                          <div>
                            <Label>Estado</Label>
                            <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusBadgeClass(reservation.status)}`}>
                              {getStatusText(reservation.status)}
                            </span>
                          </div>
                        </div>
                        {reservation.table_number && <div><Label>Mesa asignada</Label><p className="mt-1">{reservation.table_number}</p></div>}
                        {reservation.special_requests && <div><Label>Solicitudes especiales</Label><p className="mt-1">{reservation.special_requests}</p></div>}
                        <div><Label>Plataforma</Label><p className="mt-1">{reservation.conversation?.platform || "N/A"}</p></div>
                        {reservation.tags && reservation.tags.length > 0 && (
                          <div>
                            <Label>Etiquetas</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {reservation.tags.map((tag, i) => (
                                <span key={i} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Confirm button */}
                  <Button
                    onClick={() => handleQuickConfirm(reservation)}
                    disabled={isLoading || reservation.status === 'confirmed' || reservation.status === 'cancelled'}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap
                      ${reservation.status === 'confirmed' || reservation.status === 'cancelled'
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] shadow-sm"
                      }`}
                  >
                    {reservation.status === 'confirmed' ? 'Confirmada' : 'Confirmar'}
                  </Button>

                  {/* Reschedule / more */}
                  <Button
                    variant="ghost"
                    onClick={() => handleEdit(reservation)}
                    className="px-5 py-2.5 rounded-xl font-bold text-sm bg-muted text-muted-foreground hover:bg-muted/80 whitespace-nowrap"
                  >
                    Reprogramar
                  </Button>

                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-9 w-9 p-0 rounded-xl">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handleEdit(reservation)}>
                        <Edit className="mr-2 h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDelete(reservation.id)} className="text-red-600">
                        <Trash className="mr-2 h-4 w-4" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="pt-2">
              <DashboardPagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                itemsPerPage={pagination.limit}
                entityName={{ singular: "reserva", plural: "reservas" }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar / Reprogramar Reserva</DialogTitle>
            <DialogDescription>Modifica los detalles de la reserva.</DialogDescription>
          </DialogHeader>
          {selectedReservation && (
            <form onSubmit={handleUpdateReservation} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Fecha</Label>
                  <Input id="date" name="date" type="date" defaultValue={selectedReservation.reservation_date} required className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Hora</Label>
                  <Input id="time" name="time" type="time" defaultValue={selectedReservation.reservation_time} required className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="party_size">Personas</Label>
                  <Input id="party_size" name="party_size" type="number" min="1" defaultValue={selectedReservation.party_size} required className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Estado</Label>
                  <Select name="status" defaultValue={selectedReservation.status}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="confirmed">Confirmada</SelectItem>
                      <SelectItem value="completed">Completada</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="table_number">Número de Mesa / Local</Label>
                <Input id="table_number" name="table_number" placeholder="Ej: Mesa 5" defaultValue={selectedReservation.table_number || ""} className="rounded-xl" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
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
