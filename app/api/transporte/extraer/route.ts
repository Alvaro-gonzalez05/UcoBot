import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { extractPermiso, extractFactura, type PermitData } from "@/lib/transporte/extraction"

export const runtime = "nodejs"
// Hobby con Fluid Compute permite hasta 300s; Pro hasta 800s. El presupuesto
// interno (más abajo) corta antes con un error limpio.
export const maxDuration = 300

const ACCEPTED = ["application/pdf"]

interface ClientInput {
  tax_id?: string | null
  tax_id_type?: string | null
  tax_id_country?: string | null
  razon_social?: string | null
  domicilio?: string | null
  pais_code?: string | null
  roles: string[]
  source: string
}

/** Match-or-create por identificación tributaria dentro de la cuenta. */
async function findOrCreateClient(
  supabase: any, userId: string, c: ClientInput,
): Promise<{ id: string | null; status: "existente" | "nuevo" | null }> {
  if (!c.razon_social && !c.tax_id) return { id: null, status: null }

  if (c.tax_id) {
    let q = supabase.from("transport_clients").select("id").eq("user_id", userId).eq("tax_id", c.tax_id)
    q = c.tax_id_country ? q.eq("tax_id_country", c.tax_id_country) : q.is("tax_id_country", null)
    const { data: existing } = await q.maybeSingle()
    if (existing?.id) return { id: existing.id, status: "existente" }
  }

  const { data: created } = await supabase.from("transport_clients").insert({
    user_id: userId,
    tax_id: c.tax_id ?? null,
    tax_id_type: c.tax_id_type ?? null,
    tax_id_country: c.tax_id_country ?? null,
    razon_social: c.razon_social ?? "Sin nombre",
    domicilio: c.domicilio ?? null,
    pais_code: c.pais_code ?? null,
    roles: c.roles,
    source: c.source,
    needs_review: c.source !== "manual",
  }).select("id").single()
  return { id: created?.id ?? null, status: "nuevo" }
}

function buildDescripcion(p: PermitData): string {
  if (p.items.length === 0) return ""
  if (p.items.length === 1) return p.items[0].descripcion?.slice(0, 300) || ""
  const first = p.items[0].descripcion?.split(/[.,;]/)[0]?.trim() || "mercadería"
  return `${p.items.length} ítems: ${first} y otros`
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const userId = auth.user.id

  const { data: profile } = await supabase
    .from("user_profiles").select("vertical").eq("id", userId).single()
  if (profile?.vertical !== "transporte") {
    return NextResponse.json({ error: "Vertical no habilitado" }, { status: 403 })
  }

  const form = await req.formData()
  const permisoFile = form.get("permiso") as File | null
  const facturaFile = form.get("factura") as File | null
  if (!permisoFile) return NextResponse.json({ error: "Falta el permiso de embarque" }, { status: 400 })
  if (!ACCEPTED.includes(permisoFile.type)) {
    return NextResponse.json({ error: "El permiso debe ser un PDF" }, { status: 400 })
  }

  // 1) Extracción con IA — presupuesto de tiempo compartido (< límite de Vercel).
  // Los PDF digitales (texto) responden en segundos; este margen es para los
  // escaneados (visión/OCR), que son más lentos.
  const deadline = Date.now() + 110000
  let permit: PermitData
  try {
    permit = await extractPermiso(permisoFile, deadline)
  } catch (e: any) {
    console.error("extractPermiso error:", e)
    const s = e?.status ?? e?.response?.status
    const overloaded = s === 503 || s === 429 || /overload|high demand|unavailable/i.test(String(e?.message || ""))
    return NextResponse.json(
      { error: overloaded
          ? "El servicio de IA está saturado en este momento. Probá de nuevo en unos segundos."
          : "No se pudo leer el permiso. Probá con un PDF más claro." },
      { status: overloaded ? 503 : 422 },
    )
  }
  const factura = facturaFile ? await extractFactura(facturaFile, deadline).catch(() => null) : null

  const warnings: string[] = []

  // ⚠️ Coherencia permiso ↔ factura/proforma: se vinculan por el N° de proforma.
  // Si ninguno de los números de 6+ dígitos coincide, alertamos (pero NO bloqueamos).
  if (factura) {
    const digits6 = (s?: string | null) => (s ? String(s).match(/\d{6,}/g) || [] : [])
    const permNums = digits6(permit.nro_proforma)
    const facNums = digits6(factura.proforma_number)
    if (permNums.length && facNums.length && !permNums.some((n) => facNums.includes(n))) {
      warnings.unshift("⚠️ El permiso y la factura/proforma parecen de operaciones DISTINTAS (el N° de proforma no coincide). Verificá que sean del mismo embarque antes de oficializar.")
    }
  }

  // 2) Exportador (match-or-create)
  const exporter = await findOrCreateClient(supabase, userId, {
    tax_id: permit.exporter_cuit, tax_id_type: "CUIT", tax_id_country: "200",
    razon_social: permit.exporter_razon_social, domicilio: permit.exporter_domicilio,
    pais_code: "200", roles: ["exportador"], source: "permiso",
  })

  // 3) Consignatario / destinatario (desde la factura)
  let consignatario: { id: string | null; status: "existente" | "nuevo" | null } = { id: null, status: null }
  let destinatarioId: string | null = null
  let consignatarioNombre: string | null = null
  if (factura) {
    consignatario = await findOrCreateClient(supabase, userId, {
      tax_id: factura.consignatario_tax_id, tax_id_type: factura.consignatario_tax_id_type,
      tax_id_country: factura.consignatario_pais, razon_social: factura.consignatario_razon_social,
      domicilio: factura.consignatario_domicilio, pais_code: permit.pais_destino_code,
      roles: ["consignatario"], source: "factura",
    })
    consignatarioNombre = factura.consignatario_razon_social
    if (factura.destinatario_razon_social && factura.destinatario_razon_social !== factura.consignatario_razon_social) {
      const dest = await findOrCreateClient(supabase, userId, {
        razon_social: factura.destinatario_razon_social, domicilio: factura.destinatario_domicilio,
        pais_code: permit.pais_destino_code, roles: ["destinatario"], source: "factura",
      })
      destinatarioId = dest.id
    } else {
      destinatarioId = consignatario.id
    }
  } else {
    warnings.push("Subí la factura comercial para completar el consignatario/destinatario.")
  }

  // 4) Permiso de embarque (+ ítems)
  const permitNumber = permit.permit_number || `SIN-NUMERO-${Date.now()}`
  const { data: permitRow, error: permitErr } = await supabase
    .from("transport_shipping_permits").upsert({
      user_id: userId, permit_number: permitNumber, aduana_code: permit.aduana_code,
      subregimen: permit.subregimen, exporter_client_id: exporter.id,
      exporter_cuit: permit.exporter_cuit, exporter_razon_social: permit.exporter_razon_social,
      exporter_domicilio: permit.exporter_domicilio, despachante_nombre: permit.despachante_nombre,
      despachante_cuit: permit.despachante_cuit, ata_razon_social: permit.ata_razon_social,
      ata_cuit: permit.ata_cuit, via: permit.via, pais_destino_code: permit.pais_destino_code,
      puerto_embarque: permit.puerto_embarque, aduana_salida: permit.aduana_salida,
      cond_venta: permit.cond_venta, fob_total: permit.fob_total, fob_divisa: permit.fob_divisa,
      flete_total: permit.flete_total, seguro_total: permit.seguro_total, cotizacion: permit.cotizacion,
      embalaje_code: permit.embalaje_code, total_bultos: permit.total_bultos,
      peso_bruto: permit.peso_bruto, peso_neto: permit.peso_neto, vto_embarque: permit.vto_embarque,
      nro_proforma: permit.nro_proforma, status: "extracted", raw_extraction: permit as any,
    }, { onConflict: "user_id,permit_number" })
    .select("id").single()

  if (permitErr || !permitRow) {
    console.error("permit upsert error:", permitErr)
    return NextResponse.json({ error: "No se pudo guardar el permiso." }, { status: 500 })
  }
  const permitId = permitRow.id

  // ítems (reemplaza los anteriores de ese permiso)
  await supabase.from("transport_permit_items").delete().eq("permit_id", permitId)
  if (permit.items.length > 0) {
    await supabase.from("transport_permit_items").insert(
      permit.items.map((it) => ({ user_id: userId, permit_id: permitId, ...it })),
    )
  }

  // 5) Inferir corredor por país de destino
  let corridorId: string | null = null
  let corridorName: string | null = null
  if (permit.pais_destino_code) {
    const { data: corr } = await supabase.from("transport_corridors")
      .select("id, name").eq("user_id", userId).eq("match_pais_destino", permit.pais_destino_code)
      .limit(1).maybeSingle()
    corridorId = corr?.id ?? null
    corridorName = corr?.name ?? null
  }
  if (!corridorName) warnings.push("No hay un corredor configurado para este destino — revisá la ruta.")
  if (permit.peso_bruto == null) warnings.push("No se detectó el peso bruto — verificalo.")
  if (permit.fob_total == null) warnings.push("No se detectó el FOB — verificalo.")

  // 6) Viaje (MIC/DTA borrador) + CRT
  const today = new Date().toISOString().slice(0, 10)
  const { data: trip } = await supabase.from("transport_trips").insert({
    user_id: userId, corridor_id: corridorId, fecha_emision: today,
    estado: "borrador", via_transporte: 4,
  }).select("id").single()

  if (trip?.id) {
    await supabase.from("transport_crts").insert({
      user_id: userId, trip_id: trip.id, permit_id: permitId,
      remitente_client_id: exporter.id, consignatario_client_id: consignatario.id,
      destinatario_client_id: destinatarioId, destino_pais: permit.pais_destino_code,
      embalaje_code: permit.embalaje_code, cantidad: permit.total_bultos,
      peso_bruto: permit.peso_bruto, peso_neto: permit.peso_neto, fob: permit.fob_total,
      cond_venta: permit.cond_venta, divisa: permit.fob_divisa,
      descripcion_mercaderia: buildDescripcion(permit),
    })
    await supabase.from("transport_trip_events").insert({
      user_id: userId, trip_id: trip.id, event_type: "extraido",
      detail: { permit_number: permitNumber, items: permit.items.length, con_factura: !!factura },
    })
  }

  // 7) Resumen para la UI
  const trip_summary = {
    trip_id: trip?.id ?? null,
    permit_number: permitNumber,
    exporter: permit.exporter_razon_social || "—",
    pais_destino: permit.pais_destino_label
      ? `${permit.pais_destino_label}${permit.pais_destino_code ? ` (${permit.pais_destino_code})` : ""}`
      : permit.pais_destino_code || "—",
    corredor: corridorName || (permit.pais_destino_label ? `Destino ${permit.pais_destino_label}` : "—"),
    consignatario: consignatarioNombre || "—",
    client_status: factura ? consignatario.status ?? "nuevo" : "pendiente",
    items: permit.items.length,
    peso_bruto: permit.peso_bruto != null ? permit.peso_bruto.toLocaleString("es-AR") : null,
    fob: permit.fob_total != null ? `${permit.fob_divisa || ""} ${permit.fob_total.toLocaleString("es-AR")}`.trim() : null,
    cond_venta: permit.cond_venta || "—",
    crts: 1,
    warnings,
  }

  return NextResponse.json({ ok: true, trip: trip_summary })
}
