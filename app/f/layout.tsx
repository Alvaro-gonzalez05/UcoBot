import type { Metadata } from "next"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "Formulario",
}

export default function FormLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", backgroundColor: "#11131c", color: "#e1e1ef", margin: 0 }}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
