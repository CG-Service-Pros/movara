# @motion/terminology

Terminology for [Motion](https://github.com/OscarCGPro/motion): term keys, the pack schema (Zod and JSON Schema), the resolver (`org override -> active pack -> Standard`), import preview, and the neutral Standard pack.

```ts
import { resolveTerm, previewImport, STANDARD_PACK, TerminologyPack } from '@motion/terminology'
```

- JSON Schema for editors: `@motion/terminology/schema/terminology-pack.schema.json`
- Standard pack: `@motion/terminology/packs/standard.json`
- Pack format and import flow: [docs/terminology-packs.md](https://github.com/OscarCGPro/motion/blob/main/docs/terminology-packs.md)

License: Apache-2.0.
