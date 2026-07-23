import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { StockClient } from "@/components/dashboard/stock-client"
import { getAccountContext } from "@/lib/account"
import { BranchViewBanner } from "@/components/dashboard/branch-view-banner"

export default async function StockPage({
  searchParams,
}: {
  searchParams: { sucursal?: string }
}) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  // ?sucursal=<id>: el dueño mira el stock de una sucursal (solo lectura)
  const account = await getAccountContext(searchParams?.sucursal)
  const ownerId = account?.ownerId || data.user.id

  const [{ data: supplies }, { data: movements }, { data: trackedProducts }] = await Promise.all([
    supabase.from("supplies").select("*").eq("user_id", ownerId).order("name"),
    supabase
      .from("stock_movements")
      .select("*, supply:supply_id(name, unit), product:product_id(name)")
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("products")
      .select("id, name, category, track_stock, stock_quantity, low_stock_threshold")
      .eq("user_id", ownerId)
      .eq("track_stock", true)
      .order("name"),
  ])

  return (
    <>
      {account?.viewingBranch && <BranchViewBanner branchName={account.viewingBranch.name} />}
    <StockClient
      userId={ownerId}
      branchId={account?.viewingBranch?.id ?? null}
      initialSupplies={supplies || []}
      initialMovements={movements || []}
      initialTrackedProducts={trackedProducts || []}
    />
    </>
  )
}
