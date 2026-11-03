import { lookup as dnsLookup } from 'node:dns'
import https from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import type { LookupAddress } from 'node:dns'

/** Thrown for every refusal or network failure; the message is safe to show to the user. */
export class SafeFetchError extends Error {}

/** True for loopback, private, link-local, CGNAT, multicast, reserved and unspecified addresses (IPv4 and IPv6, incl. v4-mapped). */
export function isPrivateAddress(addr: string): boolean {
  const a = addr.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]!
  const v = isIP(a)
  if (v === 4) {
    const [p, q] = a.split('.').map(Number) as [number, number]
    return (
      p === 0 || p === 10 || p === 127 || p >= 224 ||
      (p === 100 && q >= 64 && q <= 127) ||
      (p === 169 && q === 254) ||
      (p === 172 && q >= 16 && q <= 31) ||
      (p === 192 && q === 168) ||
      (p === 192 && q === 0) ||
      (p === 198 && (q === 18 || q === 19))
    )
  }
  if (v === 6) {
    if (a === '::' || a === '::1') return true
    const mapped = /^(?:0{0,4}:){0,5}(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(a) ?? /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a)
    if (mapped) return isPrivateAddress(mapped[1]!)
    // v4-mapped in hex form, e.g. ::ffff:7f00:1
    const hex = /^(?:0{0,4}:){0,5}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a)
    if (hex) {
      const n = (parseInt(hex[1]!, 16) << 16) | parseInt(hex[2]!, 16)
      return isPrivateAddress(`${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`)
    }
    return /^(fc|fd|fe[89ab]|ff|64:ff9b|2001:db8|2002:)/.test(a) || a.startsWith('100:')
  }
  return false
}

/** Reject non-https URLs, credentials, odd ports, local host names and literal private IPs. */
export function assertPublicHttpsUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    throw new SafeFetchError('That is not a valid URL.')
  }
  if (u.protocol !== 'https:') throw new SafeFetchError('Only https:// URLs are allowed.')
  if (u.username || u.password) throw new SafeFetchError('URLs with credentials are not allowed.')
  if (u.port && u.port !== '443') throw new SafeFetchError('Only the default https port is allowed.')
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home.arpa')) {
    throw new SafeFetchError('Local addresses are not allowed.')
  }
  if (isIP(host.replace(/^\[|\]$/g, '')) && isPrivateAddress(host)) throw new SafeFetchError('Private addresses are not allowed.')
  return u
}

/** DNS lookup that refuses to resolve to a non-public address. The connection uses the validated address, so DNS rebinding cannot swap it. */
const guardedLookup: LookupFunction = (hostname, options, cb) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, '', 4)
    const list = addresses as LookupAddress[]
    const ok = list.filter((x) => !isPrivateAddress(x.address))
    if (!ok.length || ok.length !== list.length) return cb(new SafeFetchError('That address resolves to a private network.'), '', 4)
    if (options.all) return (cb as unknown as (e: null, a: LookupAddress[]) => void)(null, ok)
    cb(null, ok[0]!.address, ok[0]!.family)
  })
}

export type SafeFetchOptions = { maxBytes: number; timeoutMs?: number; maxRedirects?: number; accept?: string }

/**
 * GET a public https URL: guarded DNS, manual redirects (each hop re-validated), hard timeout and a streaming size cap.
 * Returns the body text.
 */
export async function safeFetchText(url: string | URL, opts: SafeFetchOptions): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 8000
  const deadline = Date.now() + timeoutMs
  let current = assertPublicHttpsUrl(String(url))
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const res = await request(current, opts, Math.max(1, deadline - Date.now()))
    if (res.status >= 300 && res.status < 400 && res.location) {
      let next: URL
      try {
        next = new URL(res.location, current)
      } catch {
        throw new SafeFetchError('The server sent an invalid redirect.')
      }
      current = assertPublicHttpsUrl(next.toString())
      continue
    }
    if (res.status === 404) throw new SafeFetchError('No pack.json found there (404).')
    if (res.status < 200 || res.status >= 300) throw new SafeFetchError(`The server answered ${res.status}.`)
    return res.body
  }
  throw new SafeFetchError('Too many redirects.')
}

function request(u: URL, opts: SafeFetchOptions, timeoutMs: number): Promise<{ status: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const req = https.request(u, { method: 'GET', lookup: guardedLookup, headers: { accept: opts.accept ?? 'application/json', 'user-agent': 'motion-pack-import' } }, (res) => {
      const status = res.statusCode ?? 0
      const location = typeof res.headers.location === 'string' ? res.headers.location : undefined
      if (status >= 300 && status < 400) {
        res.resume()
        return done(() => resolve({ status, location, body: '' }))
      }
      const type = String(res.headers['content-type'] ?? '').toLowerCase()
      if (status >= 200 && status < 300 && type && !/json|text\/plain|octet-stream/.test(type)) {
        res.resume()
        return done(() => reject(new SafeFetchError('That address did not return JSON.')))
      }
      const declared = Number(res.headers['content-length'] ?? 0)
      if (declared > opts.maxBytes) {
        res.destroy()
        return done(() => reject(new SafeFetchError('The pack is larger than 256KB.')))
      }
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        size += c.length
        if (size > opts.maxBytes) {
          res.destroy()
          return done(() => reject(new SafeFetchError('The pack is larger than 256KB.')))
        }
        chunks.push(c)
      })
      res.on('end', () => done(() => resolve({ status, body: Buffer.concat(chunks).toString('utf8') })))
      res.on('error', () => done(() => reject(new SafeFetchError('Could not read the response.'))))
    })
    const timer = setTimeout(() => {
      req.destroy()
      done(() => reject(new SafeFetchError('The request timed out.')))
    }, timeoutMs)
    req.on('error', (e) => done(() => reject(e instanceof SafeFetchError ? e : e.cause instanceof SafeFetchError ? e.cause : new SafeFetchError('Could not reach that address.'))))
    req.end()
  })
}
