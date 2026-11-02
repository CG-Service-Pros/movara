// Makes the tsc output loadable by plain Node ESM (tsc leaves extensionless relative imports):
//  - './schema'  -> './schema.js'
//  - JSON imports get `with { type: 'json' }`
// Output layout: dist/src/*.js, dist/packs/standard.json
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = new URL('../dist/src/', import.meta.url).pathname
for (const f of readdirSync(dir)) {
  if (!/\.(js|d\.ts)$/.test(f)) continue
  const p = join(dir, f)
  const out = readFileSync(p, 'utf8').replace(
    /(from\s+['"])(\.{1,2}\/[^'"]+?)(['"])(;?)/g,
    (_m, a, spec, q, semi) => {
      if (spec.endsWith('.json')) return f.endsWith('.js') ? `${a}${spec}${q} with { type: 'json' }${semi}` : `${a}${spec}${q}${semi}`
      return /\.[cm]?js$/.test(spec) ? `${a}${spec}${q}${semi}` : `${a}${spec}.js${q}${semi}`
    },
  )
  writeFileSync(p, out)
}
