import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { FormulariosManagement } from "@/components/dashboard/formularios-management"

export default async function FormulariosPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  const [{ data: forms }, { data: submissions }] = await Promise.all([
    supabase
      .from("forms")
      .select("*")
      .eq("user_id", data.user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("form_submissions")
      .select("id, form_id, user_id, client_id, data, created_at")
      .eq("user_id", data.user.id)
      .order("created_at", { ascending: false })
      .limit(200),
  ])

  return (
    <FormulariosManagement
      initialForms={forms || []}
      initialSubmissions={submissions || []}
      userId={data.user.id}
    />
  )
}
