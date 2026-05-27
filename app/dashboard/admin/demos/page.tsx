import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/server"
import { DemosClient } from "@/components/dashboard/admin/demos-client"

export default async function DemosAdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") redirect("/dashboard")

  const adminClient = createAdminClient()
  const { data: demos } = await adminClient
    .from("demo_sessions")
    .select("*")
    .order("created_at", { ascending: false })

  return <DemosClient demos={demos || []} />
}
