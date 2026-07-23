import { createClient } from "@/lib/supabase/server"
import { getAccountContext } from "@/lib/account"
import { NextRequest, NextResponse } from "next/server"

/**
 * Lee la foto de un ticket de compra con Gemini (visión) y devuelve un BORRADOR
 * de líneas para que el usuario revise antes de confirmar. No toca el stock:
 * eso pasa recién al guardar la compra (apply_purchase).
 *
 * Empareja cada línea con los insumos/productos existentes de la cuenta por
 * nombre (aproximado). Lo que no matchea vuelve sin id para que el usuario
 * lo asigne a mano; el ticket térmico se lee mal, así que la revisión es
 * obligatoria — la IA propone, la persona confirma.
 */

// Normaliza para comparar nombres: sin acentos, minúsculas, sin plurales simples
function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// ¿Comparten suficientes palabras como para considerarlo el mismo insumo?
function looseMatch(a: string, b: string): boolean {
  const wa = new Set(norm(a).split(" ").filter((w) => w.length > 2))
  const wb = norm(b).split(" ").filter((w) => w.length > 2)
  if (wa.size === 0 || wb.length === 0) return false
  const hits = wb.filter((w) => wa.has(w)).length
  return hits > 0 && hits >= Math.min(wa.size, wb.length) * 0.5
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const { image, sucursal } = await request.json()
    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "Falta la imagen" }, { status: 400 })
    }
    // data URL -> {mime, base64}
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (!match) return NextResponse.json({ error: "Formato de imagen inválido" }, { status: 400 })
    const [, mime, b64] = match

    // Cuenta sobre la que se carga (permite ?sucursal para el admin de empresa)
    const account = await getAccountContext(sucursal)
    const ownerId = account?.ownerId || user.id

    // Clave de Gemini: la del bot de la cuenta, o la demo del sistema
    const { data: bot } = await supabase
      .from("bots")
      .select("gemini_api_key")
      .eq("user_id", ownerId)
      .not("gemini_api_key", "is", null)
      .limit(1)
      .maybeSingle()
    const apiKey = bot?.gemini_api_key || process.env.GEMINI_DEMO_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "No hay una clave de IA configurada para leer el ticket" }, { status: 400 })
    }

    // Catálogo para emparejar
    const [{ data: supplies }, { data: products }] = await Promise.all([
      supabase.from("supplies").select("id, name, unit").eq("user_id", ownerId).eq("is_active", true),
      supabase.from("products").select("id, name").eq("user_id", ownerId).eq("track_stock", true),
    ])

    const prompt = `Sos un asistente que lee tickets/facturas de compra de un restaurante.
Extraé las líneas de productos comprados de la imagen. Devolvé SOLO un JSON con esta forma exacta:
{"supplier": "nombre del comercio o null", "items": [{"name": "producto", "quantity": number, "unit_cost": number}]}
Reglas:
- "quantity" es la cantidad comprada (unidades, kg, etc.). Si no aparece, usá 1.
- "unit_cost" es el PRECIO POR UNIDAD (no el total de la línea). Si el ticket muestra el total de la línea, dividilo por la cantidad.
- Ignorá subtotales, IVA, totales generales y medios de pago.
- Si un valor no se lee, usá 0.
- No inventes productos que no estén en la imagen.
Respondé únicamente con el JSON, sin texto adicional ni bloques de código.`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      console.error("Gemini scan error:", errText)
      return NextResponse.json({ error: "No se pudo leer el ticket. Probá con una foto más nítida o cargalo a mano." }, { status: 502 })
    }

    const data = await res.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
    let parsed: any
    try {
      parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim())
    } catch {
      return NextResponse.json({ error: "No se entendió el ticket. Cargalo a mano." }, { status: 422 })
    }

    // Emparejar cada línea con un insumo/producto existente
    const draft = (Array.isArray(parsed.items) ? parsed.items : []).map((it: any) => {
      const name = String(it.name || "").trim()
      const supply = (supplies || []).find((s) => looseMatch(s.name, name))
      const product = !supply ? (products || []).find((p) => looseMatch(p.name, name)) : null
      return {
        name,
        quantity: Number(it.quantity) || 1,
        unit_cost: Number(it.unit_cost) || 0,
        supply_id: supply?.id || null,
        product_id: product?.id || null,
        matched_name: supply?.name || product?.name || null,
        unit: supply?.unit || (product ? "un" : null),
      }
    })

    return NextResponse.json({ supplier: parsed.supplier || null, items: draft })
  } catch (e: any) {
    console.error("Error scanning purchase ticket:", e)
    return NextResponse.json({ error: "Error al procesar el ticket" }, { status: 500 })
  }
}
