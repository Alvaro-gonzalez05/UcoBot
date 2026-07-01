import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Hammer, ArrowRight } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export function SectionPlaceholder({
  icon: Icon, title, description, items, cta,
}: {
  icon: LucideIcon
  title: string
  description: string
  items: string[]
  cta?: { label: string; href: string }
}) {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <nav className="text-sm text-muted-foreground">
          <Link href="/dashboard/transporte" className="hover:text-foreground">Inicio</Link>
          <span className="mx-1.5">/</span><span className="text-foreground font-medium">{title}</span>
        </nav>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">{title}</h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>

      <Card className="p-8 rounded-2xl border-border/70 card-elevated">
        <div className="flex items-start gap-5 flex-col sm:flex-row">
          <div className="h-14 w-14 rounded-2xl bg-primary/15 grid place-items-center shrink-0">
            <Icon className="h-7 w-7 text-foreground" />
          </div>
          <div className="flex-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 rounded-full px-2.5 py-1">
              <Hammer className="h-3 w-3" /> En construcción
            </span>
            <p className="mt-3 text-sm text-muted-foreground">Esta sección va a permitir:</p>
            <ul className="mt-3 space-y-2">
              {items.map((it) => (
                <li key={it} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
            {cta && (
              <Link
                href={cta.href}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-4 py-2.5 text-sm hover:brightness-105 active:scale-95 transition"
              >
                {cta.label} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
