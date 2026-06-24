/**
 * Precios aproximados de los modelos de Gemini, en USD por 1.000.000 de tokens.
 * Editá acá si Google cambia las tarifas. (in = tokens de entrada, out = de salida)
 */
export const GEMINI_PRICING: Record<string, { in: number; out: number }> = {
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.0-flash": { in: 0.1, out: 0.4 },
  "gemini-3.1-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-3.5-flash": { in: 0.3, out: 2.5 },
}

const DEFAULT_PRICE = { in: 0.3, out: 2.5 }

/** Costo en USD de una llamada según modelo y tokens de entrada/salida. */
export function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = GEMINI_PRICING[model] || DEFAULT_PRICE
  return (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out
}
