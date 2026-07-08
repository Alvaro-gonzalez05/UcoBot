"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"

/**
 * Input de números con separador de miles (formato es-AR: 20000 → "20.000",
 * decimales con coma: 1500,50). Por dentro trabaja con un `number` real,
 * así que el padre recibe el valor numérico y no el texto formateado.
 *
 * Uso:
 *   <NumberInput value={price} onValueChange={(n) => setPrice(n ?? 0)} />
 */
export interface NumberInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value: number | null | undefined
  onValueChange: (value: number | null) => void
}

/** Toma lo que se escribió y lo devuelve con puntos de miles. */
function formatDisplay(raw: string): string {
  // Solo dígitos y una coma decimal
  const s = raw.replace(/[^0-9,]/g, "")
  if (s === "") return ""
  const firstComma = s.indexOf(",")
  const intRaw = firstComma === -1 ? s : s.slice(0, firstComma)
  const decRaw = firstComma === -1 ? "" : s.slice(firstComma + 1).replace(/,/g, "")
  const intClean = intRaw.replace(/^0+(?=\d)/, "") || "0"
  const intFmt = intClean.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return firstComma === -1 ? intFmt : `${intFmt},${decRaw}`
}

/** Convierte el texto formateado ("20.000,50") al número real (20000.5). */
function toNumber(display: string): number | null {
  if (display.trim() === "") return null
  const normalized = display.replace(/\./g, "").replace(",", ".")
  const n = parseFloat(normalized)
  return isNaN(n) ? null : n
}

const numberToDisplay = (v: number | null | undefined) =>
  v == null ? "" : formatDisplay(String(v).replace(".", ","))

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValueChange, inputMode = "decimal", ...props }, ref) => {
    const [display, setDisplay] = React.useState<string>(() => numberToDisplay(value))

    // Resincroniza si el valor cambia desde afuera (reset, cálculo, etc.)
    React.useEffect(() => {
      const current = toNumber(display)
      if ((value ?? null) !== (current ?? null)) {
        setDisplay(numberToDisplay(value))
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatDisplay(e.target.value)
      setDisplay(formatted)
      onValueChange(toNumber(formatted))
    }

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={inputMode}
        value={display}
        onChange={handleChange}
        {...props}
      />
    )
  }
)
NumberInput.displayName = "NumberInput"
