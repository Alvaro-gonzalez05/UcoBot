import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const { form_id, user_id, data } = await req.json()

    if (!form_id || !user_id || !data) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const supabase = await createClient()

    const { error } = await supabase.from("form_submissions").insert({
      form_id,
      user_id,
      data,
    })

    if (error) {
      console.error("Form submission error:", error)
      return NextResponse.json({ error: "Failed to save submission" }, { status: 500 })
    }

    await supabase.rpc("increment_form_submissions", { p_form_id: form_id }).catch(() => {
      supabase
        .from("forms")
        .select("submissions_count")
        .eq("id", form_id)
        .single()
        .then(({ data: form }) => {
          if (form) {
            supabase
              .from("forms")
              .update({ submissions_count: (form.submissions_count || 0) + 1 })
              .eq("id", form_id)
          }
        })
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Form submit route error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
