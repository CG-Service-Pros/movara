import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@motion/ui', '@motion/core', '@motion/db', '@motion/terminology'],
  // PGlite ships WASM + data files and postgres-js is node-only: keep them out of the bundle.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres', 'nodemailer'],
  poweredByHeader: false,
  // Lets several dev servers run side by side (each with its own build dir).
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
}
export default config
