import type { FFmpeg } from "@ffmpeg/ffmpeg"

// Instancia única de ffmpeg.wasm, cargada de forma diferida la primera vez que se usa.
// Usamos el core single-thread (no requiere SharedArrayBuffer / cabeceras COOP-COEP).
let ffmpegInstance: FFmpeg | null = null
let loadingPromise: Promise<FFmpeg> | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg")
    const { toBlobURL } = await import("@ffmpeg/util")

    const ffmpeg = new FFmpeg()
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd"
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    })

    ffmpegInstance = ffmpeg
    return ffmpeg
  })()

  return loadingPromise
}

/**
 * Transcodifica un audio (p. ej. webm/opus grabado por Chrome) a MP3,
 * que sí acepta la API de WhatsApp. Devuelve un Blob audio/mpeg.
 */
export async function transcodeToMp3(blob: Blob, inputExt = "webm"): Promise<Blob> {
  const { fetchFile } = await import("@ffmpeg/util")
  const ffmpeg = await getFFmpeg()

  const inName = `input.${inputExt}`
  const outName = "output.mp3"

  await ffmpeg.writeFile(inName, await fetchFile(blob))
  await ffmpeg.exec(["-i", inName, "-vn", "-acodec", "libmp3lame", "-q:a", "4", outName])
  const data = await ffmpeg.readFile(outName)

  try { await ffmpeg.deleteFile(inName) } catch {}
  try { await ffmpeg.deleteFile(outName) } catch {}

  const uint8 = data as Uint8Array
  return new Blob([uint8], { type: "audio/mpeg" })
}
