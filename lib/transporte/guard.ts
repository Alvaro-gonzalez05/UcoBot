import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

/**
 * Garantiza que el usuario está logueado y pertenece al vertical "transporte".
 * Redirige a /login o /dashboard según corresponda. Devuelve user + profile.
 */
export async function requireTransporte() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) redirect("/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("vertical, full_name, business_name")
    .eq("id", auth.user.id)
    .single()

  if (profile?.vertical !== "transporte") redirect("/dashboard")
  return { supabase, user: auth.user, profile }
}
