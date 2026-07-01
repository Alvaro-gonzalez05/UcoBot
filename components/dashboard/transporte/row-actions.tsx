"use client"

import { Button } from "@/components/ui/button"
import { Edit, Trash } from "lucide-react"

/** Botones visibles de Editar / Eliminar. `compact` = solo íconos (para cards de grid). */
export function RowActions({ onEdit, onDelete, compact }: { onEdit: () => void; onDelete: () => void; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <Button type="button" variant="ghost" size="icon" onClick={onEdit} aria-label="Editar"
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground">
          <Edit className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label="Eliminar"
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50">
          <Trash className="h-4 w-4" />
        </Button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Button type="button" variant="ghost" size="sm" onClick={onEdit}
        className="h-9 rounded-xl gap-1.5 text-muted-foreground hover:text-foreground">
        <Edit className="h-4 w-4" /> <span className="hidden sm:inline">Editar</span>
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDelete}
        className="h-9 rounded-xl gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50">
        <Trash className="h-4 w-4" /> <span className="hidden sm:inline">Eliminar</span>
      </Button>
    </div>
  )
}
