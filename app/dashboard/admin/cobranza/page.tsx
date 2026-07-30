import { redirect } from "next/navigation"

/** Ver /dashboard/admin/cobros: la facturación manual es una pestaña de ahí. */
export default function AdminCobranzaRedirect() {
  redirect("/dashboard/admin/cobros")
}
