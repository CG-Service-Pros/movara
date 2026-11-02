import { createHash, randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'

/** New uuid v7 (time-ordered). All ids are generated in code, not by the database. */
export const newId = (): string => uuidv7()

/** sha256 hex of an API key. Only this hash is stored. */
export const hashApiKey = (key: string): string => createHash('sha256').update(key).digest('hex')

export const API_KEY_PREFIX = 'mk_live_'

/** `mk_live_<random>`; the random part is 32 url-safe chars. */
export const generateApiKey = (): string => API_KEY_PREFIX + randomBytes(24).toString('base64url')
