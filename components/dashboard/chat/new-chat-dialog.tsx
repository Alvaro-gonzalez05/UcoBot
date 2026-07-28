"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Loader2, Search, UserRound, AlertCircle } from "lucide-react"
import { toast } from "sonner"

/**
 * "Nuevo chat": buscador sobre los clientes del CRM para arrancar una conversación
 * con alguien que todavía no escribió nunca.
 *
 * Los contactos importados desde el celular (coexistencia) entran al CRM pero no
 * tienen conversación, así que sin esto no aparecen en la lista del chat.
 */

type Client = {
  id: string
  name: string
  phone: string | null
}

export function NewChatDialog({
  open,
  onOpenChange,
  userId,
  onStarted,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Cuenta dueña (para empleados, el id del dueño) */
  userId: string
  /** Se llama con el id de la conversación lista para abrir */
  onStarted: (conversationId: string) => void
}) {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)
  const [term, setTerm] = useState("")
  const [starting, setStarting] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setTerm("")
      return
    }
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from("clients")
          .select("id, name, phone")
          .eq("user_id", userId)
          .not("phone", "is", null)
          .order("name")
          .limit(1000)

        if (cancelled) return
        if (error) {
          toast.error("No se pudieron cargar los clientes")
          return
        }
        setClients((data as Client[]) || [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, userId])

  // Filtro en memoria: con ~1000 contactos es instantáneo y evita ir al servidor
  // en cada tecla.
  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (!q) return clients.slice(0, 60)
    const digits = q.replace(/\D/g, "")
    return clients
      .filter((c) => {
        const byName = c.name?.toLowerCase().includes(q)
        const byPhone = digits.length >= 3 && (c.phone || "").includes(digits)
        return byName || byPhone
      })
      .slice(0, 60)
  }, [clients, term])

  const start = async (client: Client) => {
    if (!client.phone) return
    setStarting(client.id)
    try {
      const res = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: client.phone, name: client.name }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "No se pudo iniciar el chat")
        return
      }
      onStarted(json.conversationId)
      onOpenChange(false)
    } catch {
      toast.error("Error de red al iniciar el chat")
    } finally {
      setStarting(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo chat</DialogTitle>
          <DialogDescription>
            Elegí un cliente para empezar a hablarle por WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar por nombre o teléfono…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Aviso de la ventana de 24 hs: mejor saberlo ANTES de elegir. */}
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-border/50 p-2.5">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Si el cliente no te escribió en las últimas 24 hs, WhatsApp solo permite
              enviarle una <b className="text-foreground">plantilla aprobada</b>. El chat te
              la va a pedir automáticamente.
            </p>
          </div>

          <div className="max-h-[320px] overflow-y-auto -mx-1 px-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando clientes…
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {term ? "Ningún cliente coincide con la búsqueda" : "No tenés clientes con teléfono cargado"}
              </p>
            ) : (
              <div className="space-y-1">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => start(c)}
                    disabled={starting !== null}
                    className="w-full flex items-center gap-3 rounded-lg p-2.5 text-left hover:bg-muted/60 transition-colors disabled:opacity-60"
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <UserRound className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.phone}</p>
                    </div>
                    {starting === c.id && (
                      <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
