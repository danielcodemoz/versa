/**
 * Versa Pro licences are checked offline: a key is `VERSA1.<payload>.<signature>` where the
 * signature (ECDSA P-256 / SHA-256) is made with a private key that only the owner holds.
 * The app embeds just the public key, so it can verify a key but never create one.
 * This is honour-system protection (a determined user can patch a local app); it keeps
 * honest users honest and needs no server, which suits a local-only product.
 */
export interface LicensePayload {
  /** Who the key was issued to (shown back to the user). */
  n: string
  /** Plan. Only `pro` exists today. */
  p: 'pro'
  /** Last valid day, `YYYY-MM-DD` (UTC). Missing = no expiry. */
  e?: string
}
export type LicenseProblem = 'not-configured' | 'format' | 'signature' | 'expired'
export type LicenseCheck = { ok: true; payload: LicensePayload } | { ok: false; problem: LicenseProblem }

/** Public half of the signing key (JWK). Empty until the owner runs `npm run licence -- keygen`. */
export const publicKey: JsonWebKey | undefined = undefined
export const storageKey = 'versa-licence'
const prefix = 'VERSA1'

const decode = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))

export async function verifyLicense(token: string, key: JsonWebKey | undefined = publicKey, now = new Date()): Promise<LicenseCheck> {
  if (!key) return { ok: false, problem: 'not-configured' }
  const parts = token.trim().split('.')
  if (parts.length !== 3 || parts[0] !== prefix) return { ok: false, problem: 'format' }
  let payload: LicensePayload
  let signature: Uint8Array
  let body: Uint8Array
  try {
    body = decode(parts[1])
    signature = decode(parts[2])
    payload = JSON.parse(new TextDecoder().decode(body))
  } catch { return { ok: false, problem: 'format' } }
  if (!payload || payload.p !== 'pro' || typeof payload.n !== 'string' || (payload.e !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(payload.e))) return { ok: false, problem: 'format' }
  try {
    const verifier = await crypto.subtle.importKey('jwk', key, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifier, signature as BufferSource, new TextEncoder().encode(`${prefix}.${parts[1]}`))
    if (!valid) return { ok: false, problem: 'signature' }
  } catch { return { ok: false, problem: 'signature' } }
  if (payload.e && payload.e < now.toISOString().slice(0, 10)) return { ok: false, problem: 'expired' }
  return { ok: true, payload }
}

let active = false
export const isPro = () => active
export const setPro = (value: boolean) => { active = value }

const read = () => { try { return localStorage.getItem(storageKey) } catch { return null } }
/** Reads the saved key (if any) and switches Pro on or off. Call once at start-up. */
export async function loadLicense(key?: JsonWebKey): Promise<LicenseCheck | undefined> {
  const saved = read()
  if (!saved) { setPro(false); return undefined }
  const check = await verifyLicense(saved, key ?? publicKey)
  setPro(check.ok)
  return check
}
export async function activateLicense(token: string, key?: JsonWebKey): Promise<LicenseCheck> {
  const check = await verifyLicense(token, key ?? publicKey)
  if (check.ok) {
    try { localStorage.setItem(storageKey, token.trim()) } catch { /* Private browsing: Pro lasts until the page closes. */ }
  }
  setPro(check.ok)
  return check
}
export function removeLicense() {
  try { localStorage.removeItem(storageKey) } catch { /* Nothing saved. */ }
  setPro(false)
}
