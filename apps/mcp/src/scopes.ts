import type { Ctx, Scope } from '@motion/core'

export const allowed = (ctx: Ctx, scope: Scope | Scope[]): boolean => {
  if (ctx.scopes === 'all') return true
  const have = ctx.scopes
  return (Array.isArray(scope) ? scope : [scope]).some((s) => have.includes(s))
}
