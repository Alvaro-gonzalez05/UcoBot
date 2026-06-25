import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ReservasClient } from "@/components/dashboard/reservas-client"
import { getAccountContext } from "@/lib/account"

interface ReservasPageProps {
  searchParams: {
    page?: string
  }
}

export default async function ReservasPage({ searchParams }: ReservasPageProps) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  // Si es empleado, opera sobre los datos del dueño.
  const account = await getAccountContext()
  const ownerId = account?.ownerId || data.user.id

  // Parse pagination parameters
  const page = parseInt(searchParams.page || "1")
  const limit = 10 // Reservas por página
  const offset = (page - 1) * limit

  // Fetch reservations for the user with pagination
  const { data: reservations, count } = await supabase
    .from("reservations")
    .select(`
      *,
      client:client_id(name, phone),
      conversation:conversation_id(platform)
    `, { count: "exact" })
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false }) // Order by creation date (newest first)
    .range(offset, offset + limit - 1)

  // Calculate pagination info
  const totalItems = count || 0
  const totalPages = Math.ceil(totalItems / limit)

  return (
    <ReservasClient
      reservations={reservations || []}
      pagination={{
        page,
        limit,
        totalItems,
        totalPages,
      }}
    />
  )
}