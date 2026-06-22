import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ClientsManagement } from "@/components/dashboard/clients-management"

interface ClientsPageProps {
  searchParams: {
    page?: string
    search?: string
    tab?: string
    leadsPage?: string
  }
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  // ── Clients tab ──────────────────────────────────────────────────────────────
  const page = parseInt(searchParams.page || "1")
  const limit = 10
  const search = searchParams.search || ""
  const offset = (page - 1) * limit

  let query = supabase
    .from("clients")
    .select("*, instagram_username", { count: "exact" })
    .eq("user_id", data.user.id)

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
  }

  const { data: clients, count, error: clientsError } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (clientsError) {
    console.error("Error fetching clients:", clientsError)
  }

  const totalItems = count || 0
  const totalPages = Math.ceil(totalItems / limit)

  const paginationInfo = {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  }

  // ── Leads tab — conversations from bots with lead_qualification ───────────────
  // Fetch bots that have lead_qualification enabled
  const { data: allBots } = await supabase
    .from("bots")
    .select("id, name, features, allowed_tags")
    .eq("user_id", data.user.id)

  const leadBotIds = (allBots || [])
    .filter((b: any) => Array.isArray(b.features) && b.features.includes("lead_qualification"))
    .map((b: any) => b.id)

  let leads: any[] = []
  let leadsTotal = 0

  if (leadBotIds.length > 0) {
    const leadsPage = parseInt(searchParams.leadsPage || "1")
    const leadsOffset = (leadsPage - 1) * 20

    const { data: leadsData, count: leadsCount } = await supabase
      .from("conversations")
      .select(`
        id,
        client_name,
        client_phone,
        platform,
        lead_tags,
        last_message_at,
        created_at,
        client:client_id(id, name, phone, email),
        bot:bot_id(id, name, allowed_tags),
        orders(id, items, status, created_at)
      `, { count: "exact" })
      .eq("user_id", data.user.id)
      .in("bot_id", leadBotIds)
      .neq("platform", "test")
      .order("last_message_at", { ascending: false })
      .range(leadsOffset, leadsOffset + 19)

    leads = leadsData || []
    leadsTotal = leadsCount || 0
  }

  return (
    <ClientsManagement
      initialClients={clients || []}
      userId={data.user.id}
      pagination={paginationInfo}
      searchTerm={search}
      initialLeads={leads}
      leadsTotal={leadsTotal}
      hasLeadBots={leadBotIds.length > 0}
      initialTab={(searchParams.tab === "leads" ? "leads" : "clientes") as "clientes" | "leads"}
    />
  )
}
