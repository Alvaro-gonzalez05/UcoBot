import { createAdminClient } from "@/lib/supabase/server"
import { LoyaltyCardView } from "@/components/loyalty/loyalty-card-view"

/**
 * Tarjeta de fidelización pública del cliente final.
 * URL: /tarjeta/[loyalty_code] — sin login (ruta pública en el middleware).
 * Los datos se leen server-side con el admin client; solo se expone
 * lo necesario para mostrar la tarjeta.
 */
export default async function TarjetaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)

  const supabase = createAdminClient()

  const { data: client } = isUuid
    ? await supabase
        .from("clients")
        .select("id, name, points, stamps, total_purchases, user_id, loyalty_code")
        .eq("loyalty_code", code)
        .maybeSingle()
    : { data: null }

  if (!client) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0c0e17] text-white p-6">
        <div className="text-center space-y-2">
          <p className="text-4xl">🪪</p>
          <h1 className="text-lg font-bold">Tarjeta no encontrada</h1>
          <p className="text-sm text-white/60">
            Verificá el enlace o pedile uno nuevo al negocio.
          </p>
        </div>
      </div>
    )
  }

  const [{ data: profile }, { data: rewards }, { data: settings }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("business_name, avatar_url")
      .eq("id", client.user_id)
      .maybeSingle(),
    supabase
      .from("rewards")
      .select("id, name, description, points_cost, reward_type, reward_value, current_stock")
      .eq("user_id", client.user_id)
      .eq("is_active", true)
      .order("points_cost", { ascending: true }),
    supabase
      .from("loyalty_settings")
      .select("card_type, stamps_required, stamp_reward, card_color, logo_url, cover_image_url")
      .eq("user_id", client.user_id)
      .maybeSingle(),
  ])

  return (
    <LoyaltyCardView
      businessName={profile?.business_name || "Tu negocio"}
      clientName={client.name || "Cliente"}
      points={client.points || 0}
      stamps={client.stamps || 0}
      totalPurchases={client.total_purchases || 0}
      loyaltyCode={client.loyalty_code}
      rewards={(rewards || []).filter((r) => r.current_stock === null || r.current_stock > 0)}
      settings={{
        card_type: settings?.card_type === "stamps" ? "stamps" : "points",
        stamps_required: settings?.stamps_required || 10,
        stamp_reward: settings?.stamp_reward || null,
        card_color: settings?.card_color || "#D1F366",
        logo_url: settings?.logo_url || null,
        cover_image_url: settings?.cover_image_url || null,
      }}
    />
  )
}
