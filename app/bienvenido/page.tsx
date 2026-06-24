import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { ActivarPruebaButton } from "@/components/dashboard/activar-prueba-button"
import { CheckCircle2, Gift } from "lucide-react"

export default async function BienvenidoPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) redirect("/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("mp_preapproval_id, billing_exempt, subscription_status, trial_ends_at, business_name")
    .eq("id", data.user.id)
    .single()

  // Si ya adhirió, es exento o ya paga, no necesita este paso.
  if (profile && (profile.mp_preapproval_id || profile.billing_exempt || profile.subscription_status === "active")) {
    redirect("/dashboard")
  }

  const dias = profile?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 14

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-border p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#D1F366]/20">
          <Gift className="h-7 w-7 text-[#76a609]" />
        </div>

        <div>
          <h1 className="text-2xl font-black">¡Bienvenido{profile?.business_name ? `, ${profile.business_name}` : ""}!</h1>
          <p className="mt-2 text-muted-foreground">
            Tenés <strong>{dias} días gratis</strong>. Para usar UcoBot, activá el débito automático: no se te cobra
            nada durante la prueba y, recién al terminar, empieza el abono de <strong>$90.000 ARS/mes</strong>.
          </p>
        </div>

        <ul className="space-y-2 text-left text-sm">
          {[
            "No se cobra nada durante los 14 días",
            "El primer cobro es recién al terminar la prueba",
            "Cancelás cuando quieras desde Configuración",
          ].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              {t}
            </li>
          ))}
        </ul>

        <ActivarPruebaButton />

        <Link href="/dashboard?skip=1" className="block text-xs text-muted-foreground hover:text-foreground">
          Prefiero explorar primero
        </Link>
      </div>
    </div>
  )
}
