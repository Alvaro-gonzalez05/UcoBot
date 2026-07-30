import { redirect } from "next/navigation"

/**
 * Pagos y Cobranza se unificaron en /dashboard/admin/cobros.
 *
 * La ruta se conserva redirigiendo porque estaba en el panel desde el principio y
 * puede estar guardada en marcadores o pegada en algún lado.
 */
export default function AdminPaymentsRedirect() {
  redirect("/dashboard/admin/cobros")
}
