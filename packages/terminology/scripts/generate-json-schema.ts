import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { TerminologyPack } from '../src/schema'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema', 'terminology-pack.schema.json')
const schema = z.toJSONSchema(TerminologyPack, { io: 'input' })
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ $id: 'https://unpkg.com/@movara/terminology/schema/terminology-pack.schema.json', title: 'Movara terminology pack', ...schema }, null, 2) + '\n')
console.log('wrote', out)
