import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const here = dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'

/** The public origin(s) of the app, from APP_URL / BETTER_AUTH_URL (host[:port] form, as Next's allowedOrigins expects). */
function appHosts(): string[] {
  const out = new Set<string>()
  for (const v of [process.env.APP_URL, process.env.BETTER_AUTH_URL]) {
    if (!v) continue
    try {
      out.add(new URL(v).host)
    } catch {
      /* ignore malformed */
    }
  }
  return [...out]
}

/**
 * Content-Security-Policy. Next injects inline bootstrap scripts and the UI uses inline styles, so script/style allow
 * 'unsafe-inline' (a nonce would force every page dynamic via proxy.ts; revisit if that becomes desirable). 'unsafe-eval' and
 * ws: are development-only (React Refresh / HMR). `form-action` is intentionally not set: the OAuth consent form
 * redirects to the registered MCP client's redirect_uri, and browsers apply form-action to redirects.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${isProd ? '' : ' ws: wss:'}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : []),
]

const config: NextConfig = {
  transpilePackages: ['@motion/ui', '@motion/core', '@motion/db', '@motion/terminology', '@motion/mcp'],
  // PGlite ships WASM + data files and postgres-js is node-only: keep them out of the bundle
  // (they are still traced into the standalone output with their runtime files).
  serverExternalPackages: ['@electric-sql/pglite', 'postgres', 'nodemailer'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  // Server actions only accept same-origin requests; behind a proxy list the public host(s) from APP_URL.
  experimental: { serverActions: { allowedOrigins: appHosts() } },
  // Self-contained server (`node server.js`) for Docker / bare-metal. The tracing root is the monorepo root so
  // workspace packages (packages/*, apps/mcp) and the hoisted pnpm store are included.
  output: 'standalone',
  outputFileTracingRoot: resolve(here, '../..'),
  // Lets several dev servers run side by side (each with its own build dir).
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
}
export default config
