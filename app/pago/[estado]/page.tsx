import { CheckCircle2, XCircle, Clock } from "lucide-react"

const META: Record<string, { title: string; desc: string; color: string; Icon: any }> = {
  ok: {
    title: "¡Pago aprobado!",
    desc: "Tu pago se acreditó correctamente. Ya podés volver a la conversación.",
    color: "text-emerald-500",
    Icon: CheckCircle2,
  },
  error: {
    title: "El pago no se pudo procesar",
    desc: "Hubo un problema con el pago. Probá de nuevo o escribinos para ayudarte.",
    color: "text-red-500",
    Icon: XCircle,
  },
  pendiente: {
    title: "Pago pendiente",
    desc: "Tu pago está en proceso. Te vamos a confirmar en cuanto se acredite.",
    color: "text-amber-500",
    Icon: Clock,
  },
}

export default async function PagoEstadoPage({ params }: { params: Promise<{ estado: string }> }) {
  const { estado } = await params
  const meta = META[estado] || META.pendiente
  const { title, desc, color, Icon } = meta

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-4 rounded-2xl border border-border p-8">
        <Icon className={`mx-auto h-16 w-16 ${color}`} />
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{desc}</p>
        <p className="text-xs text-muted-foreground">Ya podés cerrar esta ventana.</p>
      </div>
    </div>
  )
}
