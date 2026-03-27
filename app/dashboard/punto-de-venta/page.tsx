import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PuntoDeVentaView } from "@/components/dashboard/punto-de-venta-view"

export default async function PuntoDeVentaPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  const { data: allBots } = await supabase
    .from("bots")
    .select("id, name, features")
    .eq("user_id", data.user.id)

  const botsWithOrders = allBots?.filter((bot) =>
    bot.features && Array.isArray(bot.features) && bot.features.includes("take_orders")
  ) || []

  if (botsWithOrders.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-[2rem] border border-dashed border-border/70 bg-card/70 p-8 text-center">
        <div className="max-w-xl space-y-3">
          <h2 className="text-2xl font-semibold">Punto de venta no habilitado</h2>
          <p className="text-muted-foreground">
            Para crear ventas desde el sistema necesitas al menos un bot con la funcion Tomar pedidos activa.
          </p>
          <p className="text-sm text-muted-foreground">
            Ve a Bots, edita uno de tus bots y habilita la funcionalidad de pedidos para usar este modulo.
          </p>
        </div>
      </div>
    )
  }

  const [{ data: products }, { data: clients }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, description, price, category, is_available, image_url, created_at")
      .eq("user_id", data.user.id)
      .eq("is_available", true)
      .order("created_at", { ascending: false })
      .range(0, 17),
    supabase
      .from("clients")
      .select("id, name, phone, instagram_username, points, total_purchases")
      .eq("user_id", data.user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  const { data: categoryRows } = await supabase
    .from("products")
    .select("category")
    .eq("user_id", data.user.id)
    .eq("is_available", true)

  const categories = Array.from(
    new Set((categoryRows || []).map((row) => row.category).filter(Boolean))
  ) as string[]

  return (
    <div className="-m-4 lg:m-0 min-h-[calc(100dvh-5rem)] lg:min-h-[calc(100vh-9rem)]">
      <PuntoDeVentaView
        userId={data.user.id}
        products={products || []}
        categories={categories}
        clients={clients || []}
      />
    </div>
  )
}