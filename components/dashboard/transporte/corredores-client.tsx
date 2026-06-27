"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Route, Plus, MoreHorizontal, Edit, Trash, MapPin, Flag, Clock, X, Wand2 } from "lucide-react"

interface Paso { pais?: string; aduana_entrada?: string; aduana_salida?: string; ciudad?: string }
interface Corridor {
  id: string
  name: string
  match_aduana_partida?: string | null
  match_pais_destino?: string | null
  partida_pais?: string | null; partida_aduana?: string | null; partida_ciudad?: string | null; partida_lugar_operativo?: string | null
  salida_aduana?: string | null; salida_ciudad?: string | null; salida_lugar_operativo?: string | null
  entrada_aduana?: string | null; entrada_ciudad?: string | null; entrada_lugar_operativo?: string | null
  destino_pais?: string | null; destino_aduana?: string | null; destino_ciudad?: string | null; destino_lugar_operativo?: string | null
  paises_paso?: Paso[] | null
  default_plazo_transporte_horas?: number | null
  default_plazo_interno_dias?: number | null
}

export function CorredoresClient({ userId, corridors }: { userId: string; corridors: Corridor[] }) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Corridor | null>(null)
  const [pasos, setPasos] = useState<Paso[]>([])
  const [loading, setLoading] = useState(false)

  const openNew = () => { setEditing(null); setPasos([]); setOpen(true) }
  const openEdit = (c: Corridor) => { setEditing(c); setPasos(Array.isArray(c.paises_paso) ? c.paises_paso : []); setOpen(true) }

  const addPaso = () => setPasos((p) => [...p, {}])
  const removePaso = (i: number) => setPasos((p) => p.filter((_, idx) => idx !== i))
  const setPaso = (i: number, k: keyof Paso, v: string) => setPasos((p) => p.map((x, idx) => idx === i ? { ...x, [k]: v } : x))

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const f = new FormData(e.currentTarget)
    const g = (k: string) => { const v = String(f.get(k) || "").trim(); return v || null }
    const payload: any = {
      user_id: userId,
      name: g("name"),
      match_aduana_partida: g("match_aduana_partida"),
      match_pais_destino: g("match_pais_destino"),
      partida_pais: g("partida_pais"), partida_aduana: g("partida_aduana"), partida_ciudad: g("partida_ciudad"), partida_lugar_operativo: g("partida_lugar_operativo"),
      salida_aduana: g("salida_aduana"), salida_ciudad: g("salida_ciudad"), salida_lugar_operativo: g("salida_lugar_operativo"),
      entrada_aduana: g("entrada_aduana"), entrada_ciudad: g("entrada_ciudad"), entrada_lugar_operativo: g("entrada_lugar_operativo"),
      destino_pais: g("destino_pais"), destino_aduana: g("destino_aduana"), destino_ciudad: g("destino_ciudad"), destino_lugar_operativo: g("destino_lugar_operativo"),
      paises_paso: pasos.map((p, i) => ({ orden: i + 1, ...p })),
      default_plazo_transporte_horas: f.get("plazo_horas") ? Number(f.get("plazo_horas")) : null,
      default_plazo_interno_dias: f.get("plazo_dias") ? Number(f.get("plazo_dias")) : null,
    }
    if (!payload.name) { toast.error("El nombre del corredor es obligatorio."); setLoading(false); return }
    try {
      const res = editing
        ? await supabase.from("transport_corridors").update(payload).eq("id", editing.id)
        : await supabase.from("transport_corridors").insert(payload)
      if (res.error) throw res.error
      toast.success(editing ? "Corredor actualizado." : "Corredor creado.")
      setOpen(false); router.refresh()
    } catch {
      toast.error("No se pudo guardar el corredor.")
    } finally { setLoading(false) }
  }

  const handleDelete = (c: Corridor) => {
    toast("¿Eliminar este corredor?", {
      description: `${c.name}. No se puede deshacer.`,
      action: {
        label: "Eliminar",
        onClick: async () => {
          const { error } = await supabase.from("transport_corridors").delete().eq("id", c.id)
          if (error) return toast.error("No se pudo eliminar.")
          toast.success("Corredor eliminado."); router.refresh()
        },
      },
    })
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-6 px-1 pt-2 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold">Corredores</h2>
          <p className="text-muted-foreground text-sm mt-1">Plantillas de ruta. Se autoseleccionan al cargar un permiso según partida y destino.</p>
        </div>
        <Button onClick={openNew} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
          <Plus className="h-4 w-4 mr-1.5" /> Nuevo corredor
        </Button>
      </div>

      {corridors.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-12 flex flex-col items-center text-center shadow-sm">
          <Route className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">Todavía no hay corredores</h3>
          <p className="text-sm text-muted-foreground mb-4">Creá tus rutas habituales para que el sistema arme la ruta solo.</p>
          <Button onClick={openNew} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
            <Plus className="h-4 w-4 mr-1.5" /> Crear el primero
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {corridors.map((c) => (
            <div key={c.id} className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center justify-between gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="flex items-center gap-5 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-[#1C1C28] text-[#D1F366] flex items-center justify-center flex-shrink-0">
                  <Route className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-lg truncate">{c.name}</h4>
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{c.partida_ciudad || c.partida_aduana || "—"}</span>
                    <span>→</span>
                    <span className="flex items-center gap-1"><Flag className="h-4 w-4" />{c.destino_ciudad || c.destino_aduana || "—"}</span>
                    {Array.isArray(c.paises_paso) && c.paises_paso.length > 0 && (
                      <span className="text-xs">· {c.paises_paso.length} país(es) de paso</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {c.match_pais_destino && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-foreground">
                        <Wand2 className="h-3 w-3" /> auto: destino {c.match_pais_destino}
                      </span>
                    )}
                    {c.default_plazo_transporte_horas != null && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                        <Clock className="h-3 w-3" /> {c.default_plazo_transporte_horas} h
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 w-9 p-0 rounded-xl"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(c)}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDelete(c)} className="text-red-600"><Trash className="mr-2 h-4 w-4" /> Eliminar</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar corredor" : "Nuevo corredor"}</DialogTitle>
            <DialogDescription>Definí la ruta y las claves para que se autoseleccione.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del corredor *</Label>
              <Input id="name" name="name" defaultValue={editing?.name} placeholder="Mendoza – Los Libertadores – Chile" className="rounded-xl" />
            </div>

            <Group title="Inferencia automática" hint="Con estos dos datos el sistema elige el corredor solo al leer el permiso.">
              <F label="Aduana de partida" name="match_aduana_partida" def={editing?.match_aduana_partida} placeholder="038" />
              <F label="País destino (código)" name="match_pais_destino" def={editing?.match_pais_destino} placeholder="208" />
            </Group>

            <Group title="Partida">
              <F label="País" name="partida_pais" def={editing?.partida_pais} placeholder="200" />
              <F label="Aduana" name="partida_aduana" def={editing?.partida_aduana} placeholder="038" />
              <F label="Ciudad" name="partida_ciudad" def={editing?.partida_ciudad} />
              <F label="Lugar operativo" name="partida_lugar_operativo" def={editing?.partida_lugar_operativo} />
            </Group>

            <Group title="Salida (frontera)">
              <F label="Aduana" name="salida_aduana" def={editing?.salida_aduana} />
              <F label="Ciudad" name="salida_ciudad" def={editing?.salida_ciudad} placeholder="Uspallata" />
              <F label="Lugar operativo" name="salida_lugar_operativo" def={editing?.salida_lugar_operativo} />
            </Group>

            <Group title="Entrada">
              <F label="Aduana" name="entrada_aduana" def={editing?.entrada_aduana} />
              <F label="Ciudad" name="entrada_ciudad" def={editing?.entrada_ciudad} placeholder="Los Andes" />
              <F label="Lugar operativo" name="entrada_lugar_operativo" def={editing?.entrada_lugar_operativo} />
            </Group>

            <Group title="Destino">
              <F label="País" name="destino_pais" def={editing?.destino_pais} placeholder="208" />
              <F label="Aduana" name="destino_aduana" def={editing?.destino_aduana} />
              <F label="Ciudad" name="destino_ciudad" def={editing?.destino_ciudad} placeholder="San Antonio" />
              <F label="Lugar operativo" name="destino_lugar_operativo" def={editing?.destino_lugar_operativo} />
            </Group>

            {/* Países de paso (repetidor) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold">Países de paso</h4>
                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={addPaso}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
                </Button>
              </div>
              {pasos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin países de paso (ruta directa).</p>
              ) : (
                <div className="space-y-2">
                  {pasos.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl border border-border p-2">
                      <span className="text-xs font-bold text-muted-foreground w-5 text-center">{i + 1}</span>
                      <Input value={p.pais || ""} onChange={(e) => setPaso(i, "pais", e.target.value)} placeholder="País" className="rounded-lg h-9" />
                      <Input value={p.aduana_entrada || ""} onChange={(e) => setPaso(i, "aduana_entrada", e.target.value)} placeholder="Ad. entrada" className="rounded-lg h-9" />
                      <Input value={p.aduana_salida || ""} onChange={(e) => setPaso(i, "aduana_salida", e.target.value)} placeholder="Ad. salida" className="rounded-lg h-9" />
                      <button type="button" onClick={() => removePaso(i)} className="h-8 w-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted hover:text-red-600 shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Group title="Plazos por defecto">
              <F label="Transporte (horas)" name="plazo_horas" type="number" def={editing?.default_plazo_transporte_horas ?? undefined} />
              <F label="Interno (días)" name="plazo_dias" type="number" def={editing?.default_plazo_interno_dias ?? undefined} />
            </Group>

            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
                {loading ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <h4 className="text-sm font-bold">{title}</h4>
      {hint && <p className="text-xs text-muted-foreground mt-0.5 mb-3">{hint}</p>}
      <div className={`grid grid-cols-2 gap-3 ${hint ? "" : "mt-3"}`}>{children}</div>
    </div>
  )
}

function F({ label, name, def, type = "text", placeholder }: { label: string; name: string; def?: string | number | null; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={def ?? undefined} placeholder={placeholder} className="rounded-xl h-9" />
    </div>
  )
}
