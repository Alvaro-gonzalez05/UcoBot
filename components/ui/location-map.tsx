"use client"

import { useEffect, useRef } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

// Estilos base de CARTO (gratis, sin API key) — los mismos que usa mapcn.
const CARTO_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"

interface LocationMapProps {
  latitude: number
  longitude: number
  /** Texto del popup del marcador (nombre/dirección del lugar). */
  label?: string
  zoom?: number
  /** Si es false, el mapa no se puede arrastrar/zoomear (modo preview). */
  interactive?: boolean
  className?: string
}

/**
 * Mapa con MapLibre GL + tiles de CARTO (gratis, sin API key). Centrado en un
 * punto con un marcador. Detecta light/dark del documento.
 */
export function LocationMap({
  latitude,
  longitude,
  label,
  zoom = 15,
  interactive = true,
  className,
}: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const isDark = document.documentElement.classList.contains("dark")

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: isDark ? CARTO_DARK : CARTO_LIGHT,
      center: [longitude, latitude],
      zoom,
      interactive,
      attributionControl: false,
    })
    mapRef.current = map

    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    }

    const marker = new maplibregl.Marker({ color: "#ef4444" })
      .setLngLat([longitude, latitude])
      .addTo(map)

    if (label) {
      marker.setPopup(new maplibregl.Popup({ offset: 24, closeButton: false }).setText(label))
    }

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [latitude, longitude, zoom, interactive, label])

  return <div ref={containerRef} className={className} />
}
