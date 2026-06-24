import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { getPreapproval, getPayment } from "@/lib/mercadopago"

/**
 * Webhook de Mercado Pago para la suscripción de UcoBot.
 * MP avisa cada cambio de la suscripción (preapproval) y cada cobro (payment).
 * Actualizamos subscription_status / subscription_end_date del usuario.
 *
 * Siempre respondemos 200 rápido para que MP no reintente en loop.
 */

// Valida la firma x-signature de MP (solo si configuraste MP_WEBHOOK_SECRET).
function isValidSignature(req: NextRequest, dataId: string): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return true // sin secret configurado, no bloqueamos (útil en pruebas)

  const sig = req.headers.get("x-signature") || ""
  const requestId = req.headers.get("x-request-id") || ""
  const parts = Object.fromEntries(
    sig.split(",").map((p) => p.split("=").map((s) => s.trim())) as [string, string][]
  )
  const ts = parts["ts"]
  const v1 = parts["v1"]
  if (!ts || !v1) return false

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const hmac = crypto.createHmac("sha256", secret).update(manifest).digest("hex")
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(v1))
  } catch {
    return false
  }
}

function plusOneMonthISO(from?: string): string {
  const d = from ? new Date(from) : new Date()
  const base = isNaN(d.getTime()) ? new Date() : d
  base.setMonth(base.getMonth() + 1)
  return base.toISOString()
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const body = await req.json().catch(() => ({} as any))

    const type: string = body?.type || url.searchParams.get("topic") || url.searchParams.get("type") || ""
    const dataId: string =
      body?.data?.id || url.searchParams.get("id") || url.searchParams.get("data.id") || ""

    if (!dataId) return NextResponse.json({ ok: true })

    if (!isValidSignature(req, dataId)) {
      console.warn("MP webhook: firma inválida")
      return NextResponse.json({ ok: true }) // no revelamos detalle, pero no procesamos
    }

    const admin = createAdminClient()

    // ── Eventos de la suscripción (preapproval) ───────────────────────────
    if (type.includes("preapproval")) {
      const pre = await getPreapproval(dataId)
      const statusMap: Record<string, string> = {
        authorized: "active",
        paused: "past_due",
        cancelled: "cancelled",
        pending: "pending",
      }
      const subStatus = statusMap[pre.status] || pre.status

      const update: Record<string, any> = {
        mp_preapproval_id: pre.id,
        subscription_status: subStatus,
      }
      if (pre.status === "authorized") {
        update.subscription_end_date = plusOneMonthISO(pre.next_payment_date)
      }

      // Buscamos al usuario por external_reference (su id) o por el preapproval id
      const userId = pre.external_reference
      let q = admin.from("user_profiles").update(update)
      q = userId ? q.eq("id", userId) : q.eq("mp_preapproval_id", pre.id)
      await q
      if (pre.status === "authorized") {
        // si es el primer alta, dejamos también la fecha de inicio
        await admin
          .from("user_profiles")
          .update({ subscription_start_date: new Date().toISOString() })
          .eq(userId ? "id" : "mp_preapproval_id", userId || pre.id)
          .is("subscription_start_date", null)
      }
      console.log(`MP preapproval ${pre.id} → ${subStatus}`)
      return NextResponse.json({ ok: true })
    }

    // ── Eventos de cobro (payment) — renovación mensual ───────────────────
    if (type.includes("payment")) {
      const pay = await getPayment(dataId)
      if (pay.status === "approved" && pay.external_reference) {
        await admin
          .from("user_profiles")
          .update({
            subscription_status: "active",
            subscription_end_date: plusOneMonthISO(),
          })
          .eq("id", pay.external_reference)

        // Registramos el cobro real (idempotente por mp_payment_id) para el panel de admin.
        await admin.from("subscription_payments").upsert(
          {
            user_id: pay.external_reference,
            mp_payment_id: String(pay.id),
            amount: pay.transaction_amount || 0,
            currency: pay.currency_id || "ARS",
            status: "approved",
            paid_at: pay.date_approved || new Date().toISOString(),
          },
          { onConflict: "mp_payment_id" }
        )
        console.log(`MP payment ${pay.id} aprobado → usuario ${pay.external_reference} activo`)
      } else if (pay.status === "rejected" && pay.external_reference) {
        await admin
          .from("user_profiles")
          .update({ subscription_status: "past_due" })
          .eq("id", pay.external_reference)
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error en webhook MP:", error)
    // Igual devolvemos 200 para evitar reintentos infinitos; ya quedó logueado.
    return NextResponse.json({ ok: true })
  }
}
