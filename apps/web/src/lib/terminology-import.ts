import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isIP } from 'node:net'

/** Max accepted size of a pack file (bytes). */
export const MAX_PACK_BYTES = 256 * 1024

export type PackSource = { kind: 'npm'; name: string; version?: string } | { kind: 'url'; url: string }

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/

export class PackFetchError extends Error {}

/** Split "@scope/pkg@1.2.3" into name + version. */
export function parseNpmSpec(spec: string): { name: string; version: string } {
  const s = spec.trim()
  const at = s.lastIndexOf('@')
  const name = at > 0 ? s.slice(0, at) : s
  const version = at > 0 ? s.slice(at + 1) : 'latest'
  if (!NPM_NAME.test(name) || name.length > 214) throw new PackFetchError('That is not a valid npm package name.')
  if (!VERSION.test(version)) throw new PackFetchError('That is not a valid version or tag.')
  return { name, version }
}

export const npmPackUrl = (name: string, version = 'latest') => `https://cdn.jsdelivr.net/npm/${name}@${version}/pack.json`

function assertPublicHttps(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    throw new PackFetchError('That is not a valid URL.')
  }
  if (u.protocol !== 'https:') throw new PackFetchError('Only https:// URLs are allowed.')
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new PackFetchError('Local addresses are not allowed.')
  const ip = isIP(host.replace(/^\[|\]$/g, ''))
  if (ip) {
    const priv = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host) || host === '::1' || /^\[?(fc|fd|fe80)/i.test(host)
    if (priv) throw new PackFetchError('Private addresses are not allowed.')
  }
  return u
}

/** Fetch JSON with a timeout, https only, no redirects to other schemes, <= 256KB. */
async function fetchJson(url: URL): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' }, cache: 'no-store' })
  } catch {
    throw new PackFetchError('Could not reach that address.')
  }
  if (res.url) assertPublicHttps(res.url)
  if (!res.ok) throw new PackFetchError(res.status === 404 ? 'No pack.json found there (404).' : `The server answered ${res.status}.`)
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_PACK_BYTES) throw new PackFetchError('The pack is larger than 256KB.')
  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_PACK_BYTES) throw new PackFetchError('The pack is larger than 256KB.')
  return parseJson(new TextDecoder().decode(buf))
}

export function parseJson(text: string): unknown {
  if (text.length > MAX_PACK_BYTES) throw new PackFetchError('The pack is larger than 256KB.')
  try {
    return JSON.parse(text)
  } catch {
    throw new PackFetchError('That is not valid JSON.')
  }
}

export async function fetchPack(source: PackSource): Promise<unknown> {
  if (source.kind === 'npm') return fetchJson(new URL(npmPackUrl(source.name, source.version)))
  return fetchJson(assertPublicHttps(source.url))
}

export type PreinstalledEntry = { spec: string; source: 'npm' | 'file'; pack?: unknown; error?: string }

/** Packs listed in MOTION_TERMINOLOGY_PACKS (comma-separated npm names or absolute file paths), loaded on demand. */
export async function loadPreinstalledPacks(): Promise<PreinstalledEntry[]> {
  const specs = (process.env.MOTION_TERMINOLOGY_PACKS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return Promise.all(
    specs.map(async (spec): Promise<PreinstalledEntry> => {
      try {
        if (path.isAbsolute(spec)) {
          const text = await readFile(spec, 'utf8')
          return { spec, source: 'file', pack: parseJson(text) }
        }
        const { name, version } = parseNpmSpec(spec)
        return { spec, source: 'npm', pack: await fetchPack({ kind: 'npm', name, version }) }
      } catch (e) {
        return { spec, source: path.isAbsolute(spec) ? 'file' : 'npm', error: e instanceof Error ? e.message : 'Could not load' }
      }
    }),
  )
}
