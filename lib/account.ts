import { createClient, createAdminClient } from "@/lib/supabase/server"

export interface AccountContext {
  userId: string
  ownerId: string
  isMember: boolean
  /** Sucursal que se está mirando desde la cuenta administradora (?sucursal=<id>) */
  viewingBranch?: { id: string; name: string } | null
}

/**
 * Resuelve la "cuenta" sobre la que opera el usuario logueado.
 * - ownerId: si es empleado, el id del DUEÑO; si es dueño, su propio id.
 *   Se usa para consultar/guardar los datos del negocio.
 * - userId: el id real del logueado (para su perfil, sidebar, etc.).
 *
 * `branchId` (viene de ?sucursal= en la URL) permite que el ADMIN de la empresa
 * mire los datos de una sucursal desde su propia sesión. Se valida que:
 *   1) quien pide sea company_admin, y
 *   2) la sucursal pertenezca a SU misma empresa.
 * Si no valida, se ignora y se devuelve la cuenta propia (nunca falla abierto).
 * Es solo lectura: las RLS de escritura siguen atadas a la cuenta propia.
 */
export async function getAccountContext(branchId?: string | null): Promise<AccountContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from("user_profiles")
    .select("parent_user_id")
    .eq("id", user.id)
    .maybeSingle()
  const parent = data?.parent_user_id || null
  const ownerId = parent || user.id

  if (!branchId || branchId === ownerId) {
    return { userId: user.id, ownerId, isMember: !!parent, viewingBranch: null }
  }

  const branch = await resolveBranchAccess(ownerId, branchId)
  if (!branch) return { userId: user.id, ownerId, isMember: !!parent, viewingBranch: null }

  return { userId: user.id, ownerId: branch.id, isMember: !!parent, viewingBranch: branch }
}

/**
 * Devuelve la sucursal si `ownerId` es company_admin de la empresa a la que
 * pertenece `branchId`. Si no, null. Usa el cliente admin porque las policies de
 * company_members se auto-referencian (ver migración 104_fix_company_members_rls_recursion).
 */
export async function resolveBranchAccess(
  ownerId: string,
  branchId: string
): Promise<{ id: string; name: string } | null> {
  try {
    const admin = createAdminClient()
    const { data: rows } = await admin
      .from("company_members")
      .select("user_id, company_id, role, branch_name")
      .in("user_id", [ownerId, branchId])

    const mine = (rows || []).find((r) => r.user_id === ownerId)
    const target = (rows || []).find((r) => r.user_id === branchId)
    if (!mine || !target) return null
    if (mine.role !== "company_admin") return null
    if (mine.company_id !== target.company_id) return null

    return { id: branchId, name: target.branch_name || "Sucursal" }
  } catch {
    return null
  }
}
