import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PublicFormRenderer } from "@/components/forms/public-form-renderer"

interface PageProps {
  params: { slug: string }
}

export default async function PublicFormPage({ params }: PageProps) {
  const supabase = await createClient()

  const { data: form, error } = await supabase
    .from("forms")
    .select("id, name, description, type, fields, steps, cotizador_config, settings, slug, is_active, user_id")
    .eq("slug", params.slug)
    .single()

  if (error || !form || !form.is_active) notFound()

  return <PublicFormRenderer form={form} />
}
