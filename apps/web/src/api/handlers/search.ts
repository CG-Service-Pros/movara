import { myWeek, search, SEARCH_TYPES, type SearchType } from '@movara/core'
import type { HandlerMap } from '../types'

/** REST handlers for the search area. Keys: "METHOD /path/:param" relative to /api/v1. */
export const handlers: HandlerMap = {
  'GET /search': async ({ ctx, query }) => {
    const types = query.get('types')?.split(',').filter((t): t is SearchType => (SEARCH_TYPES as readonly string[]).includes(t))
    return search(ctx, query.get('q') ?? '', { types, limit: query.get('limit') ? Number(query.get('limit')) : undefined })
  },
  'GET /my-week': async ({ ctx }) => myWeek(ctx),
}
