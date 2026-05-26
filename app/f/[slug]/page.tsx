import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/service"
import { PublicFormRenderer } from "@/components/forms/public-form-renderer"

interface PageProps {
  params: { slug: string }
  searchParams: { conv?: string }
}

export default async function PublicFormPage({ params, searchParams }: PageProps) {
  const supabase = createServiceClient()

  const { data: form, error } = await supabase
    .from("forms")
    .select("id, name, description, type, fields, steps, cotizador_config, settings, slug, is_active, user_id")
    .eq("slug", params.slug)
    .single()

  if (error || !form || !form.is_active) notFound()

  const { data: products } = await supabase
    .from("products")
    .select("id, name, description, price, category, image_url")
    .eq("user_id", form.user_id)
    .eq("is_available", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true })

  return <PublicFormRenderer form={form} products={products || []} conversationId={searchParams.conv} />
}
