/**
 * Lógica de condicionales de formularios, compartida por el editor
 * (formularios-management) y el renderer público (public-form-renderer).
 *
 * Retrocompatibilidad: el modelo viejo guardaba en cada campo
 *   conditional: { fieldLabel: string; values: string[] }
 * El modelo nuevo soporta MÚLTIPLES condiciones combinadas con Y/O:
 *   conditional: { logic: "and" | "or"; conditions: Condition[] }
 * `normalizeConditional` acepta las dos formas, así los formularios existentes
 * siguen funcionando sin migración.
 */

export interface Condition {
  fieldLabel: string
  values: string[] // OR interno: el campo matchea si su respuesta es cualquiera de estos
}

export interface ConditionGroup {
  logic: "and" | "or"
  conditions: Condition[]
}

// Forma vieja (un solo campo/valores) o nueva (grupo con lógica).
export type FieldConditional = ConditionGroup | { fieldLabel: string; values: string[] }

/** Salto de flujo: si la respuesta a un campo es `whenValue`, saltar al paso `targetStepId`. */
export interface StepJump {
  whenValue: string
  targetStepId: string
}

/** Convierte cualquier forma (vieja o nueva) a un ConditionGroup, o undefined si no hay condición real. */
export function normalizeConditional(raw: FieldConditional | null | undefined): ConditionGroup | undefined {
  if (!raw) return undefined

  // Forma nueva
  if ("conditions" in raw && Array.isArray(raw.conditions)) {
    const conditions = raw.conditions.filter(
      (c) => c && c.fieldLabel && Array.isArray(c.values) && c.values.length > 0
    )
    if (conditions.length === 0) return undefined
    return { logic: raw.logic === "and" ? "and" : "or", conditions }
  }

  // Forma vieja { fieldLabel, values }
  if ("fieldLabel" in raw && raw.fieldLabel && Array.isArray(raw.values) && raw.values.length > 0) {
    return { logic: "or", conditions: [{ fieldLabel: raw.fieldLabel, values: raw.values }] }
  }

  return undefined
}

/** Evalúa una condición individual contra las respuestas actuales. */
function evaluateCondition(cond: Condition, values: Record<string, string>): boolean {
  const answer = values[cond.fieldLabel] ?? ""
  // Match directo (radio/select/checkbox booleano). Para checkbox múltiple, la
  // respuesta puede venir separada por comas: matcheamos si alguna coincide.
  if (cond.values.includes(answer)) return true
  if (answer.includes(",")) {
    const parts = answer.split(",").map((p) => p.trim())
    return cond.values.some((v) => parts.includes(v))
  }
  return false
}

/**
 * ¿El elemento (campo o paso) es visible con las respuestas actuales?
 * Sin condición → siempre visible.
 */
export function isVisible(raw: FieldConditional | null | undefined, values: Record<string, string>): boolean {
  const group = normalizeConditional(raw)
  if (!group) return true
  return group.logic === "and"
    ? group.conditions.every((c) => evaluateCondition(c, values))
    : group.conditions.some((c) => evaluateCondition(c, values))
}

/**
 * Resuelve un salto de flujo a partir de los campos de un paso.
 * Devuelve el `targetStepId` del primer salto cuyo `whenValue` coincida con la
 * respuesta de su campo, o null si no hay salto aplicable.
 */
export function resolveJump(
  fields: Array<{ label: string; jumps?: StepJump[] }>,
  values: Record<string, string>
): string | null {
  for (const f of fields) {
    if (!f.jumps?.length) continue
    const answer = values[f.label] ?? ""
    const jump = f.jumps.find((j) => j.whenValue === answer)
    if (jump) return jump.targetStepId
  }
  return null
}
