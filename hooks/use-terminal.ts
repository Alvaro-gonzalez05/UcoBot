"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * Identifica la computadora que está usando el punto de venta.
 *
 * POR QUÉ HACE FALTA: una sucursal es UNA cuenta, pero puede tener varias
 * máquinas operando a la vez. Sin esto no se puede saber desde qué caja salió una
 * venta ni qué computadora abrió el turno.
 *
 * CÓMO SE IDENTIFICA: el navegador no expone ningún dato estable de la máquina
 * (por privacidad, y cualquier "huella digital" que uno arme cambia sola con las
 * actualizaciones). Así que se genera un UUID la primera vez y se guarda en
 * localStorage. Es por navegador y por perfil: Chrome y Edge en la misma PC son
 * dos terminales, y si borran los datos del sitio vuelve a aparecer como nueva.
 */

const STORAGE_KEY = "ucobot.terminal_id"

export interface Terminal {
  id: string
  name: string
  device_id: string
}

/** UUID de este navegador; lo crea la primera vez que se lo pide. */
function getOrCreateDeviceId(): string | null {
  if (typeof window === "undefined") return null
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) return saved

    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `t_${Date.now()}_${Math.random().toString(36).slice(2)}`

    window.localStorage.setItem(STORAGE_KEY, fresh)
    return fresh
  } catch {
    // Modo incógnito o almacenamiento bloqueado: se opera sin terminal en vez de
    // romper el punto de venta.
    return null
  }
}

export function useTerminal(userId?: string) {
  const supabase = createClient()
  const [terminal, setTerminal] = useState<Terminal | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const register = async () => {
      const deviceId = getOrCreateDeviceId()
      if (!deviceId) {
        setLoading(false)
        return
      }

      try {
        const { data: existing } = await supabase
          .from("pos_terminals")
          .select("id, name, device_id")
          .eq("user_id", userId)
          .eq("device_id", deviceId)
          .maybeSingle()

        if (existing) {
          if (!cancelled) setTerminal(existing as Terminal)
          // Marca de vida, para poder ordenar la lista por uso reciente.
          await supabase
            .from("pos_terminals")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", existing.id)
          return
        }

        const { data: created } = await supabase
          .from("pos_terminals")
          .insert({
            user_id: userId,
            device_id: deviceId,
            name: "Terminal sin nombre",
            user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
          })
          .select("id, name, device_id")
          .single()

        if (created && !cancelled) setTerminal(created as Terminal)
      } catch (e) {
        console.error("No se pudo registrar la terminal:", e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    register()
    return () => {
      cancelled = true
    }
  }, [userId])

  const renameTerminal = useCallback(
    async (name: string) => {
      const clean = name.trim().slice(0, 60)
      if (!terminal || !clean) return false
      const { error } = await supabase
        .from("pos_terminals")
        .update({ name: clean })
        .eq("id", terminal.id)
      if (error) return false
      setTerminal({ ...terminal, name: clean })
      return true
    },
    [terminal, supabase],
  )

  /** True si todavía tiene el nombre por defecto: la UI lo usa para pedir uno. */
  const needsName = !!terminal && terminal.name === "Terminal sin nombre"

  return { terminal, loading, renameTerminal, needsName }
}
