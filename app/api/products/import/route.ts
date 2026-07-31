import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { callGeminiWithFallback, geminiText } from "@/lib/gemini"

export const maxDuration = 60

const ACCEPTED = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_BYTES = 15 * 1024 * 1024 // 15MB

/**
 * Extrae productos de un PDF o imagen de menú/catálogo usando Gemini (visión).
 * NO guarda nada: devuelve la lista para que el usuario la revise antes de cargar.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const geminiApiKey = process.env.GEMINI_DEMO_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json({ error: "El servicio de IA no está configurado" }, { status: 500 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 })
    }
    if (!ACCEPTED.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato no soportado. Subí un PDF o una imagen (JPG, PNG, WebP)." },
        { status: 400 }
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "El archivo es muy grande (máximo 15MB)." }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString("base64")

    const prompt = `Sos un asistente que digitaliza el menú o catálogo de un negocio a partir del archivo adjunto (puede ser un PDF o una foto).

Extraé TODOS los productos/ítems que encuentres. Para cada uno devolvé:
- "name": nombre del producto (obligatorio, string corto)
- "description": descripción o ingredientes si aparecen, si no, string vacío ""
- "price": el precio como NÚMERO entero o decimal, SIN símbolos ni separadores de miles. Ej: "$1.500" → 1500 ; "2.350,00" → 2350 ; "$980" → 980. Si un ítem no tiene precio visible, usá 0.
- "category": la sección/categoría del menú a la que pertenece (ej: "Entradas", "Pizzas", "Bebidas", "Postres"). Si no hay secciones claras, usá "".

Reglas:
- Interpretá el formato de precios argentino: el "." suele ser separador de miles (1.500 = mil quinientos).
- NO inventes productos ni precios. Si algo no se lee, omitilo.
- Ignorá textos que no sean productos (teléfonos, direcciones, horarios, promos genéricas sin precio).
- Respondé ÚNICAMENTE con un JSON array válido, sin markdown ni explicaciones. Ejemplo:
[{"name":"Hamburguesa Clásica","description":"Carne, lechuga, tomate","price":3500,"category":"Hamburguesas"}]
Si no encontrás ningún producto, devolvé [].`

    // Cascada de modelos en vez de uno fijo: con "gemini-2.5-flash" clavado, un 503
    // por saturación (que Google devuelve seguido en horario pico) hacía fallar la
    // importación entera aunque el resto de los modelos estuviera disponible.
    const response = await callGeminiWithFallback(
      geminiApiKey,
      {
        contents: [
          {
            parts: [
              { inline_data: { mime_type: file.type, data: base64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: { temperature: 0.1 },
      },
      { label: "[import-catalogo]" },
    )

    if (!response || !response.ok) {
      const status = response?.status
      return NextResponse.json(
        {
          error:
            status === 503 || status === 429
              ? "El servicio de IA está saturado en este momento. Probá de nuevo en unos minutos."
              : "No se pudo procesar el archivo con la IA. Probá de nuevo.",
        },
        { status: 503 },
      )
    }

    const raw = geminiText(await response.json())
    if (!raw) {
      return NextResponse.json(
        { error: "La IA no devolvió resultados. Probá con una imagen más nítida." },
        { status: 422 },
      )
    }
    let products: any[] = []
    try {
      const match = raw.match(/\[[\s\S]*\]/)
      products = JSON.parse(match ? match[0] : raw)
    } catch {
      console.error("No se pudo parsear la respuesta de Gemini:", raw.slice(0, 500))
      return NextResponse.json(
        { error: "No se pudo leer el catálogo. Probá con una imagen más nítida o un PDF más claro." },
        { status: 422 }
      )
    }

    // Normalizar y limpiar
    const cleaned = (Array.isArray(products) ? products : [])
      .map((p) => ({
        name: String(p?.name || "").trim().slice(0, 200),
        description: String(p?.description || "").trim().slice(0, 1000),
        price: (() => {
          const n = typeof p?.price === "number" ? p.price : parseFloat(String(p?.price ?? "").replace(/[^\d.]/g, ""))
          return Number.isFinite(n) && n >= 0 ? n : 0
        })(),
        category: String(p?.category || "").trim().slice(0, 100),
      }))
      .filter((p) => p.name.length > 0)

    return NextResponse.json({ success: true, products: cleaned, count: cleaned.length })
  } catch (error) {
    console.error("Error importing catalog:", error)
    return NextResponse.json({ error: "Error procesando el archivo" }, { status: 500 })
  }
}
