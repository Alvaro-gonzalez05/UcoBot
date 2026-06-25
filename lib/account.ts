import { createClient } from "@/lib/supabase/server"

/**
 * Resuelve la "cuenta" sobre la que opera el usuario logueado.
 * - ownerId: si es empleado, el id del DUEÑO; si es dueño, su propio id.
 *   Se usa para consultar/guardar los datos del negocio.
 * - userId: el id real del logueado (para su perfil, sidebar, etc.).
 */
export async function getAccountContext(): Promise<{
  userId: string
  ownerId: string
  isMember: boolean
} | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from("user_profiles")
    .select("parent_user_id")
    .eq("id", user.id)
    .maybeSingle()
  const parent = data?.parent_user_id || null
  return { userId: user.id, ownerId: parent || user.id, isMember: !!parent }
}
