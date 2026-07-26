import { normalizeSearchText } from "@/lib/utils"

type Searchable = {
  name: string
  description?: string | null
  category?: string | null
}

/**
 * Búsqueda de productos ORDENADA POR RELEVANCIA (tolerante a acentos y mayúsculas).
 *
 * Antes se filtraba sobre "nombre + descripción + categoría" sin ranking, así que
 * el orden del catálogo mandaba: buscar "500" mostraba primero un brunch cuya
 * descripción dice "Gaseosa 500ml" y recién después la propia "Bebida de 500ml".
 *
 * Prioridad:
 *   0 · el nombre EMPIEZA con el término        ("500ml de agua")
 *   1 · el término arranca una palabra del nombre ("Bebida de |500|ml")
 *   2 · el nombre lo contiene en cualquier lugar  ("x500y")
 *   3 · matchea la categoría
 *   4 · matchea solo la descripción
 * Desempate: más cerca del principio del nombre primero, después alfabético.
 */
export function searchProducts<T extends Searchable>(products: T[], term: string): T[] {
  const q = normalizeSearchText(term.trim())
  if (!q) return products

  const scored: { item: T; score: number; pos: number }[] = []

  for (const p of products) {
    const name = normalizeSearchText(p.name || "")
    const category = normalizeSearchText(p.category || "")
    const description = normalizeSearchText(p.description || "")

    const idx = name.indexOf(q)
    if (idx === 0) {
      scored.push({ item: p, score: 0, pos: 0 })
    } else if (idx > 0) {
      // ¿arranca una palabra? (el carácter previo no es alfanumérico)
      const prev = name[idx - 1]
      const startsWord = !/[a-z0-9]/.test(prev)
      scored.push({ item: p, score: startsWord ? 1 : 2, pos: idx })
    } else if (category.includes(q)) {
      scored.push({ item: p, score: 3, pos: category.indexOf(q) })
    } else if (description.includes(q)) {
      scored.push({ item: p, score: 4, pos: description.indexOf(q) })
    }
  }

  return scored
    .sort((a, b) =>
      a.score !== b.score
        ? a.score - b.score
        : a.pos !== b.pos
          ? a.pos - b.pos
          : (a.item.name || "").localeCompare(b.item.name || "", "es")
    )
    .map((s) => s.item)
}
