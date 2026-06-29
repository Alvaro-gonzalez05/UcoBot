"use client"

import { Button } from "@/components/ui/button"
import { Edit, Trash } from "lucide-react"

/** Botones visibles de Editar / Eliminar para las filas de cada sección. */
export function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Button
        type="button" variant="ghost" size="sm" onClick={onEdit}
        className="h-9 rounded-xl gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <Edit className="h-4 w-4" /> <span className="hidden sm:inline">Editar</span>
      </Button>
      <Button
        type="button" variant="ghost" size="sm" onClick={onDelete}
        className="h-9 rounded-xl gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
      >
        <Trash className="h-4 w-4" /> <span className="hidden sm:inline">Eliminar</span>
      </Button>
    </div>
  )
}
