import crypto from 'crypto'

/**
 * Verifica y decodifica un `signed_request` de Meta.
 * Formato: `<base64url(signature)>.<base64url(payload)>`
 * El signature es HMAC-SHA256(payload, app_secret).
 *
 * Devuelve null si la firma es inválida.
 */
export function parseSignedRequest(signedRequest: string, appSecret: string): {
  user_id: string
  algorithm?: string
  issued_at?: number
  [k: string]: any
} | null {
  if (!signedRequest || !signedRequest.includes('.')) return null

  const [encodedSig, payload] = signedRequest.split('.', 2)

  const expectedSig = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest()

  const receivedSig = base64UrlDecode(encodedSig)

  if (expectedSig.length !== receivedSig.length) return null
  if (!crypto.timingSafeEqual(expectedSig, receivedSig)) return null

  try {
    const json = base64UrlDecode(payload).toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return Buffer.from(padded + padding, 'base64')
}
