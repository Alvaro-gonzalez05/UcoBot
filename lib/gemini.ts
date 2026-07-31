/**
 * Llamadas a Gemini con cascada de modelos.
 *
 * Vive acá y no dentro de una ruta porque lo necesita más de un lugar: el chat del
 * bot y la importación de catálogos. Tener la lista de modelos duplicada garantiza
 * que tarde o temprano una quede vieja y ese flujo se caiga solo.
 */

// Modelos en orden de preferencia. Si uno está saturado (503), sin cupo (429), o no
// está disponible para esta API key (404), se prueba el siguiente automáticamente.
// Cada modelo tiene su propio pool de capacidad en Google, así no dependemos de UNO.
// Incluye familia 2.x y, como respaldo, familia 3.x.
export const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
]

export interface GeminiCallOptions {
  /**
   * Se dispara con la respuesta OK y el modelo que funcionó, para registrar
   * consumo. Recibe un clon: consumir el original rompería al que llama.
   */
  onSuccess?: (res: Response, model: string) => void
  /** Aparece en los logs para saber qué flujo falló. */
  label?: string
}

/**
 * Llama a Gemini probando varios modelos en cascada. Para cada modelo reintenta una
 * vez ante errores transitorios (503/429/5xx o fallo de red). Ante CUALQUIER otra
 * falla (incluido 404 "modelo no disponible" o 4xx) pasa al siguiente modelo en vez
 * de cortar. Devuelve la primera Response OK, o la última fallida si ninguno anduvo.
 */
export async function callGeminiWithFallback(
  apiKey: string,
  body: any,
  opts?: GeminiCallOptions,
): Promise<Response | null> {
  const payload = JSON.stringify(body)
  const tag = opts?.label ? `${opts.label} ` : ""
  let lastResponse: Response | null = null

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: payload },
        )

        if (res.ok) {
          if (model !== GEMINI_MODELS[0]) {
            console.log(`✅ ${tag}Gemini respondió con modelo de respaldo: ${model}`)
          }
          opts?.onSuccess?.(res.clone(), model)
          return res
        }

        lastResponse = res
        const errText = await res.text().catch(() => "")
        console.error(`Gemini error ${tag}[${model}] intento ${attempt}: ${res.status} ${errText.substring(0, 150)}`)

        // 503 (saturado), 429 (sin cupo) o 5xx → reintentar este mismo modelo una vez.
        const transient = res.status === 503 || res.status === 429 || res.status >= 500
        if (transient && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500 * attempt))
          continue
        }
        // Agotados los reintentos (o error no transitorio como 404/400): siguiente modelo.
        break
      } catch (e) {
        console.error(`Gemini fetch error ${tag}[${model}] intento ${attempt}:`, e)
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500 * attempt))
          continue
        }
        // Fallo de red persistente con este modelo → probar el siguiente.
      }
    }
  }

  if (!lastResponse || !lastResponse.ok) {
    console.error(`❌ ${tag}Gemini falló en TODOS los modelos: [${GEMINI_MODELS.join(", ")}]`)
  }
  return lastResponse
}

/** Texto de la primera respuesta, o "" si vino vacía. */
export function geminiText(json: any): string {
  return json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ""
}
