import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/service"
import { PublicFormRenderer } from "@/components/forms/public-form-renderer"

export const revalidate = 0

interface PageProps {
  params: { slug: string }
}

export default async function PublicFormPage({ params }: PageProps) {
  const supabase = createServiceClient()

  const { data: form, error } = await supabase
    .from("forms")
    .select("id, name, description, type, fields, steps, cotizador_config, settings, slug, is_active, user_id")
    .eq("slug", params.slug)
    .single()

  if (error || !form || !form.is_active) notFound()

  // Promociones activas del negocio dueño del formulario (para mostrar descuentos en el selector)
  const { data: promotions } = await supabase
    .from("promotions")
    .select("*")
    .eq("user_id", form.user_id)
    .eq("is_active", true)

  return <PublicFormRenderer form={form} promotions={promotions || []} />
}
