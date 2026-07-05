import { createAdminClient } from "@/lib/supabase/server"
import { getGraphVersion } from "@/lib/meta/credentials"

/**
 * Persistencia de multimedia de WhatsApp.
 *
 * Meta guarda la media solo un tiempo y su URL de descarga expira. Si solo
 * guardamos el media_id, la foto/video "desaparece" al re-consultarla más tarde.
 * Estos helpers descargan la media y la suben a nuestro bucket público
 * `chat-media`, devolviendo una URL permanente que guardamos en el mensaje.
 */
const BUCKET = "chat-media"

function extFromContentType(contentType: string): string {
  const sub = contentType.split("/")[1]?.split(";")[0]?.trim()
  return sub || "bin"
}

function buildPath(userId: string, kind: string, ext: string): string {
  return `${userId}/${kind}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
}

/** Descarga una media de WhatsApp por su id y la sube a chat-media. Devuelve la URL pública o null. */
export async function storeWhatsAppMedia(opts: {
  mediaId: string
  accessToken: string
  userId: string
  kind?: string
}): Promise<string | null> {
  const { mediaId, accessToken, userId, kind = "media" } = opts
  try {
    const admin = createAdminClient()

    // 1) URL temporal del media
    const metaRes = await fetch(`https://graph.facebook.com/${getGraphVersion()}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!metaRes.ok) return null
    const metaData = await metaRes.json()
    const url = metaData?.url
    if (!url) return null

    // 2) Descargar bytes
    const dl = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!dl.ok) return null
    const contentType = dl.headers.get("content-type") || "application/octet-stream"
    const buffer = Buffer.from(await dl.arrayBuffer())

    // 3) Subir a Storage
    const path = buildPath(userId, kind, extFromContentType(contentType))
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, cacheControl: "31536000", upsert: false })
    if (error) {
      console.error("storeWhatsAppMedia upload error:", error)
      return null
    }
    return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  } catch (e) {
    console.error("storeWhatsAppMedia error:", e)
    return null
  }
}

/** Sube un buffer ya descargado (media saliente, cuando ya tenemos el archivo). */
export async function storeMediaBuffer(opts: {
  buffer: Buffer
  contentType: string
  userId: string
  kind?: string
}): Promise<string | null> {
  const { buffer, contentType, userId, kind = "media" } = opts
  try {
    const admin = createAdminClient()
    const path = buildPath(userId, kind, extFromContentType(contentType))
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, cacheControl: "31536000", upsert: false })
    if (error) {
      console.error("storeMediaBuffer upload error:", error)
      return null
    }
    return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  } catch (e) {
    console.error("storeMediaBuffer error:", e)
    return null
  }
}
