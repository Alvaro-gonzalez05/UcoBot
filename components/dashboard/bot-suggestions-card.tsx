"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Lightbulb, Loader2, Check, X, MessageSquare } from "lucide-react"

/**
 * Sugerencias para mejorar el prompt del bot.
 *
 * Salen de las charlas que el bot no resolvió (ver /api/bots/analyze-gaps). Solo
 * aparece la tarjeta si hay algo pendiente: una sección vacía permanente es la
 * mejor forma de que se deje de mirar.
 */

interface Suggestion {
  id: string
  topic: string
  rationale: string | null
  suggested_text: string
  occurrences: number
  example_conversation_ids: string[]
}

export function BotSuggestionsCard() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch("/api/bots/suggestions")
      if (!res.ok) return
      const json = await res.json()
      setSuggestions(json.suggestions || [])
    } catch {
      /* silencioso: es una ayuda, no debe romper la pantalla del bot */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const resolve = async (id: string, action: "apply" | "dismiss") => {
    setWorking(id)
    try {
      const res = await fetch("/api/bots/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo guardar")

      setSuggestions((prev) => prev.filter((s) => s.id !== id))
      toast.success(
        action === "apply" ? "Agregado a las instrucciones del bot" : "Sugerencia descartada",
        action === "apply"
          ? { description: "Se sumó al final, sin tocar lo que ya tenías configurado." }
          : undefined
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setWorking(null)
    }
  }

  if (loading || suggestions.length === 0) return null

  return (
    <div className="rounded-3xl border border-amber-300/70 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-400/20 text-amber-700 dark:text-amber-400">
          <Lightbulb className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-sm dark:text-white">Tu asistente puede mejorar</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Detectamos temas que no supo responder en las charlas de esta semana.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {suggestions.map((s) => (
          <div
            key={s.id}
            className="rounded-2xl border border-border/60 bg-background p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold dark:text-white">{s.topic}</p>
                {s.rationale && (
                  <p className="text-xs text-muted-foreground mt-0.5">{s.rationale}</p>
                )}
              </div>
              <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                <MessageSquare className="h-3 w-3" />
                {s.occurrences}
              </span>
            </div>

            {/* El texto exacto que se va a agregar: el dueño tiene que poder leerlo
                antes de aceptarlo, no aprobar a ciegas. */}
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Se agregaría esto
              </p>
              <p className="text-xs whitespace-pre-wrap dark:text-slate-200">{s.suggested_text}</p>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-1.5"
                disabled={working === s.id}
                onClick={() => resolve(s.id, "apply")}
              >
                {working === s.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Agregar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={working === s.id}
                onClick={() => resolve(s.id, "dismiss")}
              >
                <X className="h-3.5 w-3.5" />
                No aplica
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
