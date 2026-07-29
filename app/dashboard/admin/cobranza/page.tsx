import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { BillingManager } from "@/components/dashboard/admin/billing-manager"

/**
 * Cobranza manual de clientes.
 *
 * Complementa /dashboard/admin/payments, que muestra lo que cobra Mercado Pago
 * solo. Acá van los acuerdos particulares que se facturan a mano.
 */
export const dynamic = "force-dynamic"

export default function CobranzaPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="px-1 pt-2">
        <Link
          href="/dashboard/admin"
          className="text-sm text-muted-foreground flex items-center gap-1 mb-2 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Panel
        </Link>
        <h2 className="text-3xl font-bold dark:text-white">Cobranza</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Clientes con facturación manual: cuánto, cada cuánto y cuándo toca cobrar.
        </p>
      </div>

      <BillingManager />
    </div>
  )
}
