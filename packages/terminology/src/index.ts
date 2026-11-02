export * from './schema'
export * from './resolve'
import standard from '../packs/standard.json'
import { TerminologyPack } from './schema'

/** The Standard pack, parsed and always complete. */
export const STANDARD_PACK: TerminologyPack = TerminologyPack.parse(standard)
