const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const UNSUBSCRIBE_CONFIRMATION_URL = 'https://aoid.vercel.app/unsubscribe'

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid unsubscribe token.')
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function encryptionKey(secret: string) {
  if (new TextEncoder().encode(secret).length < 32) {
    throw new Error('OUTREACH_UNSUBSCRIBE_SECRET must contain at least 32 random bytes.')
  }
  const keyMaterial = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function createUnsubscribeToken(userId: string, email: string, secret: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (!USER_ID_PATTERN.test(userId) || !EMAIL_PATTERN.test(normalizedEmail)) {
    throw new Error('A valid account and recipient email are required to create an unsubscribe link.')
  }
  const payload = new TextEncoder().encode(JSON.stringify({
    userId,
    email: normalizedEmail,
  }))
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    await encryptionKey(secret),
    payload,
  )
  return `${encodeBase64Url(nonce)}.${encodeBase64Url(new Uint8Array(ciphertext))}`
}

export async function verifyUnsubscribeToken(token: string, secret: string) {
  if (token.length > 4096) throw new Error('Invalid unsubscribe token.')
  const [encodedNonce, encodedCiphertext, ...extra] = token.split('.')
  if (!encodedNonce || !encodedCiphertext || extra.length) throw new Error('Invalid unsubscribe token.')
  let nonce: Uint8Array
  let ciphertext: Uint8Array
  try {
    nonce = decodeBase64Url(encodedNonce)
    ciphertext = decodeBase64Url(encodedCiphertext)
  } catch {
    throw new Error('Invalid unsubscribe token.')
  }
  if (nonce.length !== 12) throw new Error('Invalid unsubscribe token.')
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      await encryptionKey(secret),
      ciphertext,
    )
  } catch {
    throw new Error('Invalid unsubscribe token.')
  }
  const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext))
  if (
    !parsed ||
    typeof parsed.userId !== 'string' ||
    !USER_ID_PATTERN.test(parsed.userId) ||
    typeof parsed.email !== 'string' ||
    !EMAIL_PATTERN.test(parsed.email) ||
    parsed.email !== parsed.email.trim().toLowerCase()
  ) {
    throw new Error('Invalid unsubscribe token.')
  }
  return { userId: parsed.userId, email: parsed.email }
}
