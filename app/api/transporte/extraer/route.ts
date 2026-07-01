import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { extractPermiso, extractFactura, type PermitData, type FacturaData } from "@/lib/transporte/extraction"

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

// Genera el "detalle" con el formato usado en el CRT/MIC:
//   "93 BULTOS DICIENDO CONTENER:
//    3.240 PY ST E 10 1200 2400 BR (90)
//    ..."
function buildDescripcion(p: PermitData): string {
  if (p.items.length === 0) return ""
  const fmt = (n: number | null) => n != null ? n.toLocaleString("es-AR") : ""
  const header = p.total_bultos != null
    ? `${p.total_bultos} ${(p.embalaje_code === "05" ? "CONTENEDORES" : "BULTOS")} DICIENDO CONTENER:`
    : "DICIENDO CONTENER:"
  const lines = p.items.map((it) =>
    [fmt(it.cantidad), (it.descripcion || "").trim()].filter(Boolean).join(" ")
  ).filter(Boolean)
  return [header, ...lines].join("\n").slice(0, 2000)
}

const digits5 = (s?: string | null) => (s ? String(s).match(/\d{5,}/g) || [] : [])

/** ¿La factura corresponde a este permiso? (por N° de proforma o de factura) */
function facturaMatchesPermit(factura: FacturaData, permit: PermitData): boolean {
  const permNums = [...digits5(permit.nro_proforma), ...digits5(permit.nros_facturas)]
  const facNums = [...digits5(factura.proforma_number), ...digits5(factura.invoice_number)]
  return permNums.length > 0 && facNums.length > 0 && permNums.some((n) => facNums.includes(n))
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
  // Varios permisos = carga CONSOLIDADA (1 MIC con varios CRT). Cero clicks extra.
  const permisoFiles = form.getAll("permiso").filter((f): f is File => f instanceof File)
  const facturaFile = form.get("factura") as File | null
  if (permisoFiles.length === 0) return NextResponse.json({ error: "Falta el permiso de embarque" }, { status: 400 })
  for (const f of permisoFiles) {
    if (!ACCEPTED.includes(f.type)) return NextResponse.json({ error: "Los permisos deben ser PDF" }, { status: 400 })
  }

  // 1) Extracción con IA — permisos + factura, TODO en paralelo.
  const deadline = Date.now() + 110000
  const permitPs = permisoFiles.map((f) => extractPermiso(f, deadline))
  const facturaP: Promise<FacturaData | null> = facturaFile
    ? extractFactura(facturaFile, deadline).catch(() => null)
    : Promise.resolve(null)

  const settled = await Promise.allSettled(permitPs)
  const factura = await facturaP

  const permits: PermitData[] = []
  const warnings: string[] = []
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") permits.push(r.value)
    else {
      console.error(`extractPermiso[${i}] error:`, r.reason)
      warnings.push(`No se pudo leer el permiso "${permisoFiles[i].name}" — probá subirlo de nuevo.`)
    }
  })

  if (permits.length === 0) {
    const e: any = (settled[0] as PromiseRejectedResult).reason
    const s = e?.status ?? e?.response?.status
    const overloaded = s === 503 || s === 429 || /overload|high demand|unavailable/i.test(String(e?.message || ""))
    return NextResponse.json(
      { error: overloaded
          ? "El servicio de IA está saturado en este momento. Probá de nuevo en unos segundos."
          : "No se pudo leer el permiso. Probá con un PDF más claro." },
      { status: overloaded ? 503 : 422 },
    )
  }

  const consolidado = permits.length > 1
  const first = permits[0]

  // 2) Coherencia permiso ↔ factura (contra CUALQUIERA de los permisos)
  let facturaPermitIdx = 0 // a qué permiso corresponde la factura
  if (factura) {
    const matchIdx = permits.findIndex((p) => facturaMatchesPermit(factura, p))
    if (matchIdx >= 0) facturaPermitIdx = matchIdx
    else {
      const anyNums = permits.some((p) => digits5(p.nro_proforma).length || digits5(p.nros_facturas).length)
      const facNums = [...digits5(factura.proforma_number), ...digits5(factura.invoice_number)]
      if (anyNums && facNums.length) {
        warnings.unshift("⚠️ El permiso y la factura/proforma parecen de operaciones DISTINTAS (los números de proforma/factura no coinciden). Verificá que sean del mismo embarque antes de oficializar.")
      }
    }
  }

  // 3) Consignatario / destinatario (desde la factura)
  let consignatario: { id: string | null; status: "existente" | "nuevo" | null } = { id: null, status: null }
  let destinatarioId: string | null = null
  let consignatarioNombre: string | null = null
  if (factura) {
    consignatario = await findOrCreateClient(supabase, userId, {
      tax_id: factura.consignatario_tax_id, tax_id_type: factura.consignatario_tax_id_type,
      tax_id_country: factura.consignatario_pais, razon_social: factura.consignatario_razon_social,
      domicilio: factura.consignatario_domicilio, pais_code: first.pais_destino_code,
      roles: ["consignatario"], source: "factura",
    })
    consignatarioNombre = factura.consignatario_razon_social
    if (factura.destinatario_razon_social && factura.destinatario_razon_social !== factura.consignatario_razon_social) {
      const dest = await findOrCreateClient(supabase, userId, {
        razon_social: factura.destinatario_razon_social, domicilio: factura.destinatario_domicilio,
        pais_code: first.pais_destino_code, roles: ["destinatario"], source: "factura",
      })
      destinatarioId = dest.id
    } else {
      destinatarioId = consignatario.id
    }
  } else {
    warnings.push("Subí la factura comercial para completar el consignatario/destinatario.")
  }

  // 4) Inferir corredor por país de destino (del primer permiso)
  let corridorId: string | null = null
  let corridorName: string | null = null
  if (first.pais_destino_code) {
    const { data: corr } = await supabase.from("transport_corridors")
      .select("id, name").eq("user_id", userId).eq("match_pais_destino", first.pais_destino_code)
      .limit(1).maybeSingle()
    corridorId = corr?.id ?? null
    corridorName = corr?.name ?? null
  }
  if (!corridorName) warnings.push("No hay un corredor configurado para este destino — revisá la ruta.")
  if (first.peso_bruto == null) warnings.push("No se detectó el peso bruto — verificalo.")
  if (first.fob_total == null) warnings.push("No se detectó el FOB — verificalo.")

  // 5) UN viaje (MIC/DTA borrador) + un CRT por permiso (consolidado si hay varios)
  const today = new Date().toISOString().slice(0, 10)
  const { data: trip } = await supabase.from("transport_trips").insert({
    user_id: userId, corridor_id: corridorId, fecha_emision: today,
    estado: "borrador", via_transporte: 4, consolidado,
  }).select("id").single()

  let totalItems = 0
  let crtsCreados = 0

  for (let i = 0; i < permits.length; i++) {
    const permit = permits[i]

    // exportador de ESTE permiso (match-or-create)
    const exporter = await findOrCreateClient(supabase, userId, {
      tax_id: permit.exporter_cuit, tax_id_type: "CUIT", tax_id_country: "200",
      razon_social: permit.exporter_razon_social, domicilio: permit.exporter_domicilio,
      pais_code: "200", roles: ["exportador"], source: "permiso",
    })

    // permiso + ítems
    const permitNumber = permit.permit_number || `SIN-NUMERO-${Date.now()}-${i}`
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
      warnings.push(`No se pudo guardar el permiso ${permitNumber}.`)
      continue
    }
    const permitId = permitRow.id

    await supabase.from("transport_permit_items").delete().eq("permit_id", permitId)
    if (permit.items.length > 0) {
      await supabase.from("transport_permit_items").insert(
        permit.items.map((it) => ({ user_id: userId, permit_id: permitId, ...it })),
      )
    }
    totalItems += permit.items.length

    // CRT de este permiso (el consignatario de la factura va al permiso que matchea)
    if (trip?.id) {
      const isFacturaPermit = i === facturaPermitIdx
      await supabase.from("transport_crts").insert({
        user_id: userId, trip_id: trip.id, permit_id: permitId,
        remitente_client_id: exporter.id,
        consignatario_client_id: isFacturaPermit ? consignatario.id : null,
        destinatario_client_id: isFacturaPermit ? destinatarioId : null,
        destino_pais: permit.pais_destino_code,
        embalaje_code: permit.embalaje_code, cantidad: permit.total_bultos,
        peso_bruto: permit.peso_bruto, peso_neto: permit.peso_neto, fob: permit.fob_total,
        cond_venta: permit.cond_venta, divisa: permit.fob_divisa,
        consolidado,
        descripcion_mercaderia: buildDescripcion(permit),
      })
      crtsCreados++
    }
  }

  if (trip?.id) {
    await supabase.from("transport_trip_events").insert({
      user_id: userId, trip_id: trip.id, event_type: "extraido",
      detail: { permisos: permits.map((p) => p.permit_number), crts: crtsCreados, consolidado, con_factura: !!factura },
    })
  }

  // 6) Resumen para la UI
  const trip_summary = {
    trip_id: trip?.id ?? null,
    permit_number: consolidado
      ? `${permits.length} permisos (consolidado)`
      : (first.permit_number || "—"),
    exporter: consolidado
      ? [...new Set(permits.map((p) => p.exporter_razon_social).filter(Boolean))].join(" · ")
      : (first.exporter_razon_social || "—"),
    pais_destino: first.pais_destino_label
      ? `${first.pais_destino_label}${first.pais_destino_code ? ` (${first.pais_destino_code})` : ""}`
      : first.pais_destino_code || "—",
    corredor: corridorName || (first.pais_destino_label ? `Destino ${first.pais_destino_label}` : "—"),
    consignatario: consignatarioNombre || "—",
    client_status: factura ? consignatario.status ?? "nuevo" : "pendiente",
    items: totalItems,
    peso_bruto: (() => {
      const total = permits.reduce((a, p) => a + (p.peso_bruto ?? 0), 0)
      return total > 0 ? total.toLocaleString("es-AR") : null
    })(),
    fob: (() => {
      const total = permits.reduce((a, p) => a + (p.fob_total ?? 0), 0)
      return total > 0 ? `${first.fob_divisa || ""} ${total.toLocaleString("es-AR")}`.trim() : null
    })(),
    cond_venta: first.cond_venta || "—",
    crts: crtsCreados,
    consolidado,
    warnings,
  }

  return NextResponse.json({ ok: true, trip: trip_summary })
}
