import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CargarViajeBento } from "@/components/dashboard/transporte/cargar-viaje-bento"

export const dynamic = "force-dynamic"

export default async function CargarViajePage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) redirect("/login")
  const { data: profile } = await supabase
    .from("user_profiles").select("vertical").eq("id", auth.user.id).single()
  if (profile?.vertical !== "transporte") redirect("/dashboard")

  return <CargarViajeBento />
}
