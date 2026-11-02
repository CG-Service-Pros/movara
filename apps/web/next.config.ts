import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@motion/ui', '@motion/core', '@motion/db', '@motion/terminology'],
  // PGlite ships WASM + data files and postgres-js is node-only: keep them out of the bundle.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres', 'nodemailer'],
  poweredByHeader: false,
}
export default config
