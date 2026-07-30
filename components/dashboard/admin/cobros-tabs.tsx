"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ReactNode } from "react"

/**
 * Pestañas de la sección de cobros.
 *
 * Existe solo para poner un contenedor de cliente alrededor de contenido que se
 * arma en el servidor: las tres vistas llegan ya renderizadas como `children`, así
 * las consultas siguen ocurriendo del lado del servidor y acá no se vuelve a pedir
 * nada al cambiar de pestaña.
 *
 * POR QUÉ ESTÁN JUNTAS (29/07/2026): antes eran dos secciones separadas del panel,
 * "Pagos" (lo que cobra Mercado Pago solo) y "Cobranza" (los acuerdos que se
 * facturan a mano). Son la misma pregunta — quién paga, cuánto y cuándo — partida
 * en dos lugares, y obligaba a mirar dos pantallas para saber cómo viene el mes.
 */
export function CobrosTabs({
  clientes,
  movimientos,
  manual,
}: {
  clientes: ReactNode
  movimientos: ReactNode
  manual: ReactNode
}) {
  return (
    <Tabs defaultValue="clientes" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="clientes">Clientes</TabsTrigger>
        <TabsTrigger value="movimientos">Últimos cobros</TabsTrigger>
        <TabsTrigger value="manual">Facturación manual</TabsTrigger>
      </TabsList>

      <TabsContent value="clientes" className="mt-0">
        {clientes}
      </TabsContent>
      <TabsContent value="movimientos" className="mt-0">
        {movimientos}
      </TabsContent>
      <TabsContent value="manual" className="mt-0">
        {manual}
      </TabsContent>
    </Tabs>
  )
}
