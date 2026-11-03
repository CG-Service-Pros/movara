import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { assertPublicHttpsUrl, safeFetchText, SafeFetchError } from './safe-fetch'

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

/** Fetch JSON through the SSRF-guarded fetcher: https only, public addresses only, 8s timeout, <= 256KB. */
async function fetchJson(url: URL): Promise<unknown> {
  try {
    return parseJson(await safeFetchText(url, { maxBytes: MAX_PACK_BYTES, timeoutMs: 8000 }))
  } catch (e) {
    if (e instanceof SafeFetchError) throw new PackFetchError(e.message)
    throw e
  }
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
  try {
    return await fetchJson(assertPublicHttpsUrl(source.url))
  } catch (e) {
    if (e instanceof SafeFetchError) throw new PackFetchError(e.message)
    throw e
  }
}

export type PreinstalledEntry = { spec: string; source: 'npm' | 'file'; pack?: unknown; error?: string }

/** Packs listed in MOVARA_TERMINOLOGY_PACKS (comma-separated npm names or absolute file paths), loaded on demand. */
export async function loadPreinstalledPacks(): Promise<PreinstalledEntry[]> {
  const specs = (process.env.MOVARA_TERMINOLOGY_PACKS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
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
