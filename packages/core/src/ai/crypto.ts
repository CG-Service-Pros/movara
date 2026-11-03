import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { MovaraError } from '../errors'

/** Same development fallback the web app uses when BETTER_AUTH_SECRET is unset outside production. */
const DEV_SECRET = 'movara-dev-secret-change-me-in-production-0000'

/**
 * The master secret for encrypting stored credentials: `MOVARA_ENCRYPTION_KEY`, else `BETTER_AUTH_SECRET`.
 * Production without either throws; elsewhere a clearly-labelled development secret is used.
 */
export function encryptionSecret(env: Record<string, string | undefined> = process.env): string {
  const s = env.MOVARA_ENCRYPTION_KEY || env.BETTER_AUTH_SECRET
  if (s) return s
  if (env.NODE_ENV === 'production') {
    throw new MovaraError('validation', 'Set MOVARA_ENCRYPTION_KEY (or BETTER_AUTH_SECRET) to store API keys securely')
  }
  return DEV_SECRET
}

const deriveKey = (secret: string): Buffer =>
  Buffer.from(hkdfSync('sha256', secret, 'movara/v1', 'org-ai-settings/api-key', 32))

export type EncryptedSecret = { ciphertext: string; iv: string; tag: string }

/** AES-256-GCM. All three parts are base64. */
export function encryptSecret(plain: string, secret: string = encryptionSecret()): EncryptedSecret {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') }
}

export function decryptSecret(blob: EncryptedSecret, secret: string = encryptionSecret()): string {
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(blob.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(blob.ciphertext, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    throw new MovaraError('validation', 'The stored API key cannot be decrypted (the encryption secret changed). Enter the key again in Settings.')
  }
}
