"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { X, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react"

export interface MediaItem {
  src: string
  fallback?: string
  type?: "image" | "video"
}

interface ImageLightboxProps {
  items: MediaItem[]
  initialIndex?: number
  onClose: () => void
}

const MIN_SCALE = 1
const MAX_SCALE = 4

export function ImageLightbox({ items, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [useFallback, setUseFallback] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  const current = items[index]
  const isVideo = current?.type === "video"
  const mediaSrc = useFallback && current?.fallback ? current.fallback : current?.src
  const hasMany = items.length > 1

  const go = (dir: number) => setIndex((i) => (i + dir + items.length) % items.length)

  // Reset zoom/fallback al cambiar de archivo
  useEffect(() => {
    setScale(1)
    setPos({ x: 0, y: 0 })
    setUseFallback(false)
  }, [index])

  // Teclado: Esc cierra, flechas navegan
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft" && hasMany) go(-1)
      else if (e.key === "ArrowRight" && hasMany) go(1)
    }
    window.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, hasMany, items.length])

  const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
  const zoomBy = (delta: number) =>
    setScale((s) => {
      const next = clamp(Math.round((s + delta) * 100) / 100)
      if (next <= MIN_SCALE) setPos({ x: 0, y: 0 })
      return next
    })
  const reset = () => {
    setScale(1)
    setPos({ x: 0, y: 0 })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    setPos({
      x: dragRef.current.ox + (e.clientX - dragRef.current.startX),
      y: dragRef.current.oy + (e.clientY - dragRef.current.startY),
    })
  }
  const onPointerUp = () => {
    dragRef.current = null
  }

  if (!current) return null

  const btn =
    "flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
  const navBtn =
    "absolute top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 z-10"

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      onWheel={(e) => {
        e.stopPropagation()
        if (!isVideo) zoomBy(e.deltaY < 0 ? 0.3 : -0.3)
      }}
    >
      {/* Controles superiores */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {!isVideo && (
          <>
            <button type="button" onClick={() => zoomBy(-0.5)} className={btn} title="Alejar">
              <ZoomOut className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => zoomBy(0.5)} className={btn} title="Acercar">
              <ZoomIn className="h-5 w-5" />
            </button>
            {scale > 1 && (
              <button type="button" onClick={reset} className={btn} title="Restablecer">
                <RotateCcw className="h-5 w-5" />
              </button>
            )}
          </>
        )}
        <button type="button" onClick={onClose} className={btn} title="Cerrar">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Flechas de navegación */}
      {hasMany && (
        <>
          <button
            type="button"
            className={`${navBtn} left-3`}
            onClick={(e) => {
              e.stopPropagation()
              go(-1)
            }}
            title="Anterior"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            className={`${navBtn} right-3`}
            onClick={(e) => {
              e.stopPropagation()
              go(1)
            }}
            title="Siguiente"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Contador */}
      {hasMany && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
          {index + 1} / {items.length}
        </div>
      )}

      {/* Media con animación */}
      <motion.div
        key={index}
        className="flex max-h-full max-w-full items-center justify-center p-4"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            src={mediaSrc}
            controls
            autoPlay
            playsInline
            onError={() => setUseFallback(true)}
            className="max-h-[88vh] max-w-[92vw] rounded-lg bg-black shadow-2xl"
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={mediaSrc}
            alt="Imagen"
            draggable={false}
            onError={() => setUseFallback(true)}
            onDoubleClick={() => (scale > 1 ? reset() : setScale(2))}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
              cursor: scale > 1 ? (dragRef.current ? "grabbing" : "grab") : "zoom-in",
              transition: dragRef.current ? "none" : "transform 0.15s ease-out",
            }}
            className="max-h-[88vh] max-w-[92vw] select-none rounded-lg object-contain shadow-2xl"
          />
        )}
      </motion.div>
    </motion.div>
  )
}
