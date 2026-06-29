import { GoogleGenerativeAI } from "@google/generative-ai"

// ── Tipos de salida ─────────────────────────────────────────────────────────
export interface PermitItem {
  item_number: number | null
  ncm_position: string | null
  descripcion: string | null
  estado: string | null
  kg_neto: number | null
  unidad: string | null
  cantidad: number | null
  fob_unitario: number | null
  fob_total_divisa: number | null
  pais_destino_comercial: string | null
}

export interface PermitData {
  permit_number: string | null
  aduana_code: string | null
  subregimen: string | null
  exporter_cuit: string | null
  exporter_razon_social: string | null
  exporter_domicilio: string | null
  despachante_nombre: string | null
  despachante_cuit: string | null
  ata_razon_social: string | null
  ata_cuit: string | null
  via: string | null
  pais_destino_code: string | null
  pais_destino_label: string | null
  puerto_embarque: string | null
  aduana_salida: string | null
  cond_venta: string | null
  fob_total: number | null
  fob_divisa: string | null
  flete_total: number | null
  seguro_total: number | null
  cotizacion: number | null
  embalaje_code: string | null
  total_bultos: number | null
  peso_bruto: number | null
  peso_neto: number | null
  vto_embarque: string | null
  nro_proforma: string | null
  items: PermitItem[]
}

export interface FacturaData {
  consignatario_tax_id: string | null
  consignatario_tax_id_type: string | null
  consignatario_pais: string | null
  consignatario_razon_social: string | null
  consignatario_domicilio: string | null
  destinatario_razon_social: string | null
  destinatario_domicilio: string | null
  fob_total: number | null
  proforma_number: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────
// Modelo configurable por env. Default: 2.5-pro (más preciso para la DDJJ;
// la extracción es de bajo volumen). Apuntalo a otro modelo/familia si querés:
//   GEMINI_EXTRACTION_MODEL=gemini-2.5-flash  (o un 3.x si tu API key lo soporta)
const MODEL = process.env.GEMINI_EXTRACTION_MODEL || "gemini-2.5-pro"

export function num(v: any): number | null {
  if (v == null || v === "") return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  let s = String(v).replace(/[^\d.,-]/g, "")
  if (!s) return null
  if (s.includes(",")) {
    // formato AR: '.' miles, ',' decimal
    s = s.replace(/\./g, "").replace(",", ".")
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

export function dateOrNull(v: any): string | null {
  if (!v) return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  return null
}

// Normalización de códigos: la IA suele traer el NOMBRE; los mapeamos al código.
const PAIS_CODES: Record<string, string> = {
  ARGENTINA: "200", CHILE: "208", BOLIVIA: "202", BRASIL: "203", BRAZIL: "203",
  PARAGUAY: "221", PERU: "222", "PERÚ": "222", URUGUAY: "225",
}
export function paisCode(label?: string | null, code?: string | null): string | null {
  const c = code ? String(code).trim() : ""
  if (/^\d{3}$/.test(c)) return c
  if (label) {
    const k = label.trim().toUpperCase()
    if (PAIS_CODES[k]) return PAIS_CODES[k]
  }
  return c || null
}
const EMBALAJE_CODES: Record<string, string> = { CONTENEDOR: "05", BULTOS: "99" }
export function embalajeCode(v?: string | null): string | null {
  if (!v) return null
  const s = String(v).trim()
  if (/^\d{2}$/.test(s)) return s
  return EMBALAJE_CODES[s.toUpperCase()] ?? s
}

function parseJson(raw: string): any {
  const cleaned = raw.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "")
  const match = cleaned.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : cleaned)
}

async function callGemini(file: File, prompt: string): Promise<any> {
  const apiKey = process.env.GEMINI_DEMO_API_KEY
  if (!apiKey) throw new Error("IA no configurada")
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64")
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: MODEL })
  const result = await model.generateContent([
    { inlineData: { mimeType: file.type || "application/pdf", data: base64 } },
    { text: prompt },
  ])
  return parseJson(result.response.text())
}

// ── Extracción del PERMISO DE EMBARQUE (OM-1993 SIM) ─────────────────────────
const PERMIT_PROMPT = `Sos un asistente aduanero. El archivo adjunto es un PERMISO DE EMBARQUE argentino (formulario OM-1993 SIM / declaración de exportación del Sistema MALVINA).

Extraé los datos y devolvé ÚNICAMENTE un JSON válido (sin markdown) con esta forma exacta:
{
  "permit_number": string|null,           // ej "26038EG01001192P"
  "aduana_code": string|null,             // ej "038"
  "subregimen": string|null,
  "exporter_cuit": string|null,
  "exporter_razon_social": string|null,   // Importador/Exportador
  "exporter_domicilio": string|null,
  "despachante_nombre": string|null,
  "despachante_cuit": string|null,
  "ata_razon_social": string|null,        // Agente de Transporte Aduanero
  "ata_cuit": string|null,
  "via": string|null,                     // ej "CAMION"
  "pais_destino_code": string|null,       // código del país destino del transporte, ej "208"
  "pais_destino_label": string|null,      // ej "CHILE"
  "puerto_embarque": string|null,
  "aduana_salida": string|null,
  "cond_venta": string|null,              // FOB, CPT, CIF...
  "fob_total": number|null,
  "fob_divisa": string|null,              // ej "DOL"
  "flete_total": number|null,
  "seguro_total": number|null,
  "cotizacion": number|null,
  "embalaje_code": string|null,
  "total_bultos": number|null,
  "peso_bruto": number|null,
  "peso_neto": number|null,
  "vto_embarque": string|null,            // formato YYYY-MM-DD
  "nro_proforma": string|null,
  "items": [
    {
      "item_number": number|null,
      "ncm_position": string|null,        // posición SIM, ej "2204.21.00.200F"
      "descripcion": string|null,
      "estado": string|null,
      "kg_neto": number|null,
      "unidad": string|null,
      "cantidad": number|null,
      "fob_unitario": number|null,
      "fob_total_divisa": number|null,
      "pais_destino_comercial": string|null
    }
  ]
}

Reglas:
- Devolvé los NÚMEROS como números con punto decimal (ej 10400.72), sin separador de miles ni símbolos.
- Las fechas en formato YYYY-MM-DD.
- Si un dato no aparece, poné null. NO inventes datos.
- Incluí TODOS los ítems de la mercadería (el permiso suele tener varios).`

export async function extractPermiso(file: File): Promise<PermitData> {
  const d = await callGemini(file, PERMIT_PROMPT)
  const items: PermitItem[] = Array.isArray(d?.items) ? d.items.map((it: any) => ({
    item_number: it?.item_number ?? null,
    ncm_position: it?.ncm_position ?? null,
    descripcion: it?.descripcion ?? null,
    estado: it?.estado ?? null,
    kg_neto: num(it?.kg_neto),
    unidad: it?.unidad ?? null,
    cantidad: num(it?.cantidad),
    fob_unitario: num(it?.fob_unitario),
    fob_total_divisa: num(it?.fob_total_divisa),
    pais_destino_comercial: it?.pais_destino_comercial ?? null,
  })) : []
  return {
    permit_number: d?.permit_number ?? null,
    aduana_code: d?.aduana_code ?? null,
    subregimen: d?.subregimen ?? null,
    exporter_cuit: d?.exporter_cuit ?? null,
    exporter_razon_social: d?.exporter_razon_social ?? null,
    exporter_domicilio: d?.exporter_domicilio ?? null,
    despachante_nombre: d?.despachante_nombre ?? null,
    despachante_cuit: d?.despachante_cuit ?? null,
    ata_razon_social: d?.ata_razon_social ?? null,
    ata_cuit: d?.ata_cuit ?? null,
    via: d?.via ?? null,
    pais_destino_code: paisCode(d?.pais_destino_label, d?.pais_destino_code),
    pais_destino_label: d?.pais_destino_label ?? null,
    puerto_embarque: d?.puerto_embarque ?? null,
    aduana_salida: d?.aduana_salida ?? null,
    cond_venta: d?.cond_venta ?? null,
    fob_total: num(d?.fob_total),
    fob_divisa: d?.fob_divisa ?? null,
    flete_total: num(d?.flete_total),
    seguro_total: num(d?.seguro_total),
    cotizacion: num(d?.cotizacion),
    embalaje_code: embalajeCode(d?.embalaje_code),
    total_bultos: d?.total_bultos != null ? Math.round(num(d?.total_bultos) ?? 0) : null,
    peso_bruto: num(d?.peso_bruto),
    peso_neto: num(d?.peso_neto),
    vto_embarque: dateOrNull(d?.vto_embarque),
    nro_proforma: d?.nro_proforma ?? null,
    items,
  }
}

// ── Extracción de la FACTURA COMERCIAL (consignatario/destinatario) ──────────
const FACTURA_PROMPT = `El archivo adjunto es una FACTURA COMERCIAL o una PROFORMA DE EXPORTACIÓN (ej. formulario "Operación de Exportación"). Necesito identificar al cliente del exterior.

Buscá específicamente estos campos (pueden estar en español/inglés):
- "CONSIGNADO A" / "CONSIGNEE TO"  -> consignatario
- "NOTIFICAR" / "NOTIFY"           -> destinatario / parte a notificar (si difiere del consignatario)
- "VENDIDO POR" / "SOLD BY" / comprador -> identificación tributaria del comprador del exterior
- identificación tributaria extranjera: RFC (México), RUT (Chile), RUC (Perú/Paraguay), u otra; también puede figurar un "CUIT" de exterior.
- país de destino (ej. del "PUERTO DESTINO" o el domicilio del consignatario)

Devolvé ÚNICAMENTE un JSON válido (sin markdown) con esta forma:
{
  "consignatario_tax_id": string|null,
  "consignatario_tax_id_type": string|null,// "RFC" | "RUT" | "RUC" | "CUIT" | "OTRO"
  "consignatario_pais": string|null,
  "consignatario_razon_social": string|null,
  "consignatario_domicilio": string|null,
  "destinatario_razon_social": string|null,// de NOTIFICAR, si difiere del consignatario
  "destinatario_domicilio": string|null,
  "fob_total": number|null,                // Gran Total / monto total
  "proforma_number": string|null           // N° de proforma / orden de venta ("SALE ORDER", "SU ORDEN", ej "XN 6609 - 13009714")
}
Reglas: números con punto decimal; si un dato no aparece, null; NO inventes.`

export async function extractFactura(file: File): Promise<FacturaData> {
  const d = await callGemini(file, FACTURA_PROMPT)
  return {
    consignatario_tax_id: d?.consignatario_tax_id ?? null,
    consignatario_tax_id_type: d?.consignatario_tax_id_type ?? null,
    consignatario_pais: d?.consignatario_pais ?? null,
    consignatario_razon_social: d?.consignatario_razon_social ?? null,
    consignatario_domicilio: d?.consignatario_domicilio ?? null,
    destinatario_razon_social: d?.destinatario_razon_social ?? null,
    destinatario_domicilio: d?.destinatario_domicilio ?? null,
    fob_total: num(d?.fob_total),
    proforma_number: d?.proforma_number ?? null,
  }
}
