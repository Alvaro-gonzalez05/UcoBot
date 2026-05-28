"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { UserPlus } from "lucide-react"
import { CreateUserDialog } from "./create-user-dialog"

export function CreateUserButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="rounded-xl h-10 bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold shadow-sm gap-2"
      >
        <UserPlus className="w-4 h-4" />
        Nuevo usuario
      </Button>
      <CreateUserDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
