import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * Resumen consolidado del negocio para el ADMIN de empresa (company_admin).
 *
 * Devuelve, por sucursal y en total: ventas del período (por medio de pago),
 * cantidad de pedidos, estado de la caja y los cierres de caja del período.
 *
 * Se usa el cliente ADMIN (service role) para evitar depender de las RLS
 * cross-sucursal en cada tabla, PERO se valida antes que el usuario logueado
 * sea company_admin de la empresa que consulta: sin eso, 403.
 */

export interface BranchSummary {
  userId: string
  branchName: string
  isAdminAccount: boolean
  salesTotal: number
  ordersCount: number
  byMethod: Record<string, number>
  tips: number
  openSession: { id: string; openedBy: string; openedAt: string; openingAmount: number } | null
  /** Insumos y productos por agotarse (stock <= umbral configurado) */
  lowStock: { name: string; quantity: number; unit: string; threshold: number; kind: "supply" | "product" }[]
  /**
   * Nivel de stock de la sucursal. `level` es el promedio de (stock / umbral):
   * 100% = justo en el mínimo que definió el local, 200% = el doble. `levelWeekAgo`
   * reconstruye el nivel de hace 7 días restando los movimientos del período.
   */
  stockSummary: { itemsTotal: number; lowCount: number; level: number | null; levelWeekAgo: number | null }
  /** Gastos e ingresos manuales del período (para la vista de finanzas embebida) */
  expenses: number
  manualIncome: number
  /** Últimos pedidos, para ver la actividad del local sin salir del resumen */
  recentOrders: { id: string; total: number; status: string; source: string; createdAt: string; items: number }[]
  closures: {
    id: string
    openedBy: string
    closedBy: string | null
    openedAt: string
    closedAt: string | null
    openingAmount: number
    closingAmount: number | null
    difference: number | null
    expectedTotals: Record<string, number> | null
    notes: string | null
  }[]
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const admin = createAdminClient()

  // El que consulta tiene que ser company_admin (si es empleado, se toma su dueño)
  const { data: profile } = await admin
    .from("user_profiles")
    .select("parent_user_id, team_enabled")
    .eq("id", user.id)
    .maybeSingle()
  const ownerId = profile?.parent_user_id || user.id

  const { data: membership } = await admin
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", ownerId)
    .maybeSingle()

  if (!membership || membership.role !== "company_admin") {
    return NextResponse.json({ error: "Solo el administrador del negocio puede ver el resumen" }, { status: 403 })
  }

  // Período: por defecto el mes en curso
  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from") || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const to = searchParams.get("to") || new Date().toISOString()

  const { data: members } = await admin
    .from("company_members")
    .select("user_id, branch_name, role")
    .eq("company_id", membership.company_id)
    .order("created_at", { ascending: true })

  const accountIds = (members || []).map((m) => m.user_id)
  if (accountIds.length === 0) return NextResponse.json({ branches: [], from, to })

  // Una sola consulta por tabla para todas las sucursales
  const [
    { data: orders },
    { data: sessions },
    { data: supplies },
    { data: stockProducts },
    { data: weekMovements },
    { data: transactions },
  ] = await Promise.all([
    admin
      .from("orders")
      .select("id, user_id, total_amount, payments, tip_amount, status, created_at, source, items")
      .in("user_id", accountIds)
      .neq("status", "cancelled")
      .gte("created_at", from)
      .lte("created_at", to),
    admin
      .from("cash_sessions")
      .select("*")
      .in("user_id", accountIds)
      .order("opened_at", { ascending: false }),
    admin
      .from("supplies")
      .select("id, user_id, name, unit, stock_quantity, low_stock_threshold")
      .in("user_id", accountIds)
      .eq("is_active", true)
      .not("low_stock_threshold", "is", null),
    admin
      .from("products")
      .select("id, user_id, name, stock_quantity, low_stock_threshold")
      .in("user_id", accountIds)
      .eq("track_stock", true)
      .not("low_stock_threshold", "is", null),
    // Movimientos de la última semana: sirven para reconstruir el nivel anterior
    admin
      .from("stock_movements")
      .select("user_id, supply_id, product_id, quantity")
      .in("user_id", accountIds)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    admin
      .from("financial_transactions")
      .select("user_id, type, amount")
      .in("user_id", accountIds)
      .gte("transaction_date", from.slice(0, 10))
      .lte("transaction_date", to.slice(0, 10)),
  ])

  const branches: BranchSummary[] = (members || []).map((m) => {
    const branchOrders = (orders || []).filter((o) => o.user_id === m.user_id)
    const byMethod: Record<string, number> = {}
    let tips = 0
    let salesTotal = 0

    for (const o of branchOrders) {
      salesTotal += Number(o.total_amount) || 0
      tips += Number(o.tip_amount) || 0
      const payments = Array.isArray(o.payments) ? o.payments : []
      for (const p of payments) {
        const method = (p as any)?.method || "other"
        byMethod[method] = (byMethod[method] || 0) + (Number((p as any)?.amount) || 0)
      }
    }

    const branchSessions = (sessions || []).filter((s) => s.user_id === m.user_id)
    const open = branchSessions.find((s) => s.status === "open")

    // Stock bajo: insumos y productos que llegaron (o bajaron) del umbral
    const lowStock = [
      ...(supplies || [])
        .filter((s) => s.user_id === m.user_id && Number(s.stock_quantity) <= Number(s.low_stock_threshold))
        .map((s) => ({
          name: s.name as string,
          quantity: Number(s.stock_quantity),
          unit: (s.unit as string) || "un",
          threshold: Number(s.low_stock_threshold),
          kind: "supply" as const,
        })),
      ...(stockProducts || [])
        .filter((p) => p.user_id === m.user_id && Number(p.stock_quantity ?? 0) <= Number(p.low_stock_threshold))
        .map((p) => ({
          name: p.name as string,
          quantity: Number(p.stock_quantity ?? 0),
          unit: "un",
          threshold: Number(p.low_stock_threshold),
          kind: "product" as const,
        })),
    ].sort((a, b) => a.quantity / (a.threshold || 1) - b.quantity / (b.threshold || 1))

    // Nivel de stock: promedio de (stock / umbral). 100% = justo en el mínimo.
    // El nivel de hace 7 días se reconstruye restando los movimientos del período.
    const levelRows: { ratioNow: number; ratioBefore: number }[] = []
    const netMovement = (id: string, field: "supply_id" | "product_id") =>
      (weekMovements || [])
        .filter((m) => m[field] === id)
        .reduce((acc, m) => acc + (Number(m.quantity) || 0), 0)

    for (const s of (supplies || []).filter((s) => s.user_id === m.user_id)) {
      const threshold = Number(s.low_stock_threshold)
      if (!threshold) continue
      const now = Number(s.stock_quantity) || 0
      levelRows.push({
        ratioNow: now / threshold,
        ratioBefore: Math.max(0, now - netMovement(s.id as string, "supply_id")) / threshold,
      })
    }
    for (const p of (stockProducts || []).filter((p) => p.user_id === m.user_id)) {
      const threshold = Number(p.low_stock_threshold)
      if (!threshold) continue
      const now = Number(p.stock_quantity) || 0
      levelRows.push({
        ratioNow: now / threshold,
        ratioBefore: Math.max(0, now - netMovement(p.id as string, "product_id")) / threshold,
      })
    }

    const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null)
    const stockSummary = {
      itemsTotal: levelRows.length,
      lowCount: lowStock.length,
      level: levelRows.length ? Math.round((avg(levelRows.map((r) => r.ratioNow)) as number) * 100) : null,
      levelWeekAgo: levelRows.length ? Math.round((avg(levelRows.map((r) => r.ratioBefore)) as number) * 100) : null,
    }

    return {
      userId: m.user_id,
      branchName: m.branch_name || "Sucursal",
      isAdminAccount: m.role === "company_admin",
      salesTotal,
      ordersCount: branchOrders.length,
      byMethod,
      tips,
      lowStock,
      stockSummary,
      expenses: (transactions || [])
        .filter((t) => t.user_id === m.user_id && t.type === "expense")
        .reduce((acc, t) => acc + (Number(t.amount) || 0), 0),
      manualIncome: (transactions || [])
        .filter((t) => t.user_id === m.user_id && t.type === "income")
        .reduce((acc, t) => acc + (Number(t.amount) || 0), 0),
      recentOrders: [...branchOrders]
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .slice(0, 6)
        .map((o) => ({
          id: o.id as string,
          total: Number(o.total_amount) || 0,
          status: (o.status as string) || "",
          source: (o.source as string) || "pos",
          createdAt: o.created_at as string,
          items: Array.isArray(o.items) ? o.items.length : 0,
        })),
      openSession: open
        ? {
            id: open.id,
            openedBy: open.opened_by,
            openedAt: open.opened_at,
            openingAmount: Number(open.opening_amount) || 0,
          }
        : null,
      closures: branchSessions
        .filter((s) => s.status === "closed" && s.closed_at && s.closed_at >= from && s.closed_at <= to)
        .map((s) => ({
          id: s.id,
          openedBy: s.opened_by,
          closedBy: s.closed_by,
          openedAt: s.opened_at,
          closedAt: s.closed_at,
          openingAmount: Number(s.opening_amount) || 0,
          closingAmount: s.closing_amount === null ? null : Number(s.closing_amount),
          difference: s.difference === null ? null : Number(s.difference),
          expectedTotals: s.expected_totals,
          notes: s.notes,
        })),
    }
  })

  return NextResponse.json({ branches, from, to })
}
