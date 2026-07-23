import Link from "next/link"
import { Store, X } from "lucide-react"

/**
 * Aviso de que el dueño está operando sobre una SUCURSAL y no sobre su propia
 * cuenta. Es importante que se note: todo lo que se cargue acá (ventas, gastos,
 * stock) queda a nombre de esa sucursal.
 */
export function BranchViewBanner({
  branchName,
  backHref = "/dashboard",
}: {
  branchName: string
  backHref?: string
}) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#D1F366]/60 bg-[#D1F366]/10 px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1f2030]">
        <Store className="h-4 w-4 text-[#d8ff55]" />
      </span>
      <p className="min-w-0 flex-1 text-sm">
        Estás gestionando <span className="font-semibold">{branchName}</span>
        <span className="hidden text-muted-foreground sm:inline"> · lo que hagas acá queda en esta sucursal</span>
      </p>
      <Link
        href={backHref}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background/70 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-background"
      >
        <X className="h-3 w-3" /> Salir
      </Link>
    </div>
  )
}
