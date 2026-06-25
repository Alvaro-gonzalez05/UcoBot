import Link from "next/link"
import { MessageSquare, Calendar, ShoppingBag, Store, Users, Gift, FileText, ArrowRight } from "lucide-react"

const SECTION_META: Record<string, { label: string; desc: string; href: string; icon: any; color: string }> = {
  chat: { label: "Chat", desc: "Atendé las conversaciones de los clientes", href: "/dashboard/chat", icon: MessageSquare, color: "text-blue-500 bg-blue-50 dark:bg-blue-900/30" },
  reservas: { label: "Reservas / Turnos", desc: "Gestioná la agenda y los turnos", href: "/dashboard/reservas", icon: Calendar, color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30" },
  pedidos: { label: "Pedidos", desc: "Mirá y gestioná los pedidos", href: "/dashboard/pedidos", icon: ShoppingBag, color: "text-orange-500 bg-orange-50 dark:bg-orange-900/30" },
  "punto-de-venta": { label: "Punto de venta", desc: "Cargá ventas en el local", href: "/dashboard/punto-de-venta", icon: Store, color: "text-violet-500 bg-violet-50 dark:bg-violet-900/30" },
  clientes: { label: "Clientes", desc: "Consultá la base de clientes", href: "/dashboard/clientes", icon: Users, color: "text-sky-500 bg-sky-50 dark:bg-sky-900/30" },
  promociones: { label: "Promociones", desc: "Mirá las promociones activas", href: "/dashboard/promociones", icon: Gift, color: "text-pink-500 bg-pink-50 dark:bg-pink-900/30" },
  formularios: { label: "Formularios", desc: "Gestioná los formularios", href: "/dashboard/formularios", icon: FileText, color: "text-teal-500 bg-teal-50 dark:bg-teal-900/30" },
}

export function EmployeeHome({ name, sections }: { name: string; sections: string[] }) {
  const allowed = sections.map((s) => SECTION_META[s]).filter(Boolean)

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-3xl bg-gradient-to-br from-[#D1F366]/20 to-transparent border border-border p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-black dark:text-white">¡Hola{name ? `, ${name}` : ""}! 👋</h1>
        <p className="text-muted-foreground mt-1">
          Bienvenido/a. Desde acá podés acceder a tus tareas. Elegí una sección para empezar.
        </p>
      </div>

      {allowed.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allowed.map((s) => {
            const Icon = s.icon
            return (
              <Link
                key={s.href}
                href={s.href}
                className="group bg-card rounded-3xl p-6 shadow-sm border border-border hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col gap-3"
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${s.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold">{s.label}</p>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-[#76a609] dark:text-[#D1F366] group-hover:gap-2 transition-all">
                  Ir <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="bg-card rounded-3xl border border-border p-10 text-center text-muted-foreground">
          Todavía no tenés secciones asignadas. Pedile al dueño que te habilite acceso.
        </div>
      )}
    </div>
  )
}
