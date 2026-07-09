"use client"

import { useRef } from "react"

/**
 * Barrita de agarre para bottom sheets (móvil): se puede arrastrar hacia abajo
 * para cerrar el modal, como en las apps nativas. Si no se pasa el umbral,
 * vuelve a su lugar con un pequeño resorte.
 *
 * Funciona buscando el contenedor del diálogo (role="dialog") y moviéndolo
 * con transform mientras dura el gesto.
 */
export function SheetGrabBar({ onDismiss }: { onDismiss: () => void }) {
  const barRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const lastY = useRef(0)
  const lastT = useRef(0)
  const velocity = useRef(0)
  const dragging = useRef(false)

  const getSheet = (): HTMLElement | null =>
    (barRef.current?.closest('[role="dialog"]') as HTMLElement | null)

  const onTouchStart = (e: React.TouchEvent) => {
    // Solo en móvil (el sheet centrado de desktop no se arrastra)
    if (typeof window !== "undefined" && window.innerWidth >= 640) return
    dragging.current = true
    startY.current = e.touches[0].clientY
    lastY.current = e.touches[0].clientY
    lastT.current = performance.now()
    velocity.current = 0
    const sheet = getSheet()
    if (sheet) sheet.style.transition = "none"
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return
    const y = e.touches[0].clientY
    const now = performance.now()
    const dt = now - lastT.current
    if (dt > 0) velocity.current = (y - lastY.current) / dt // px/ms
    lastY.current = y
    lastT.current = now

    const dy = Math.max(0, y - startY.current)
    const sheet = getSheet()
    if (sheet) sheet.style.transform = `translateY(${dy}px)`
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!dragging.current) return
    dragging.current = false
    const dy = Math.max(0, e.changedTouches[0].clientY - startY.current)
    const sheet = getSheet()
    if (!sheet) return

    // Cierra si arrastró lo suficiente o soltó con velocidad (flick)
    const shouldClose = dy > 110 || (dy > 30 && velocity.current > 0.55)
    if (shouldClose) {
      sheet.style.transition = "transform 0.2s ease-in"
      sheet.style.transform = "translateY(105%)"
      window.setTimeout(onDismiss, 160)
    } else {
      sheet.style.transition = "transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)"
      sheet.style.transform = ""
      window.setTimeout(() => {
        sheet.style.transition = ""
      }, 300)
    }
  }

  return (
    <div
      ref={barRef}
      className="sm:hidden -mx-4 -mt-2 shrink-0 touch-none px-4 pt-2 pb-3 cursor-grab active:cursor-grabbing"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/25" />
    </div>
  )
}
