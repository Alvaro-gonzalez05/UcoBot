import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"

export async function POST(req: NextRequest) {
  try {
    const { form_id, user_id, data } = await req.json()

    if (!form_id || !user_id || !data) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { error } = await supabase.from("form_submissions").insert({
      form_id,
      user_id,
      data,
    })

    if (error) {
      console.error("Form submission error:", error)
      return NextResponse.json({ error: "Failed to save submission" }, { status: 500 })
    }

    try {
      await supabase.rpc("increment_form_submissions", { p_form_id: form_id })
    } catch {
      const { data: formRow } = await supabase
        .from("forms")
        .select("submissions_count")
        .eq("id", form_id)
        .single()
      if (formRow) {
        await supabase
          .from("forms")
          .update({ submissions_count: (formRow.submissions_count || 0) + 1 })
          .eq("id", form_id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Form submit route error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
