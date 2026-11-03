# @movara/terminology

Terminology for [Movara](https://github.com/movara-app/movara): term keys, the pack schema (Zod and JSON Schema), the resolver (`org override -> active pack -> Standard`), import preview, and the neutral Standard pack.

```ts
import { resolveTerm, previewImport, STANDARD_PACK, TerminologyPack } from '@movara/terminology'
```

- JSON Schema for editors: `@movara/terminology/schema/terminology-pack.schema.json`
- Standard pack: `@movara/terminology/packs/standard.json`
- Pack format and import flow: [docs/terminology-packs.md](https://github.com/movara-app/movara/blob/main/docs/terminology-packs.md)

License: Apache-2.0.
