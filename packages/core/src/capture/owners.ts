export type OwnerCandidate = { id: string; name: string; email: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const ME = /^(me|myself|i|moi|yo)$/

/**
 * Resolve the owner text an agent wrote ("me", "maya@acme.com", "Maya Reyes", "Maya") to a person id, or null when it
 * cannot be resolved UNIQUELY. Order: me/myself/I -> self, email, full name, first name, last name, unique name
 * prefix/token match. An ambiguous match (two Mayas) resolves to nothing: a wrong owner is worse than none.
 */
export function resolveOwnerRef(people: OwnerCandidate[], ref: string | null | undefined, selfId: string | null): string | null {
  if (!ref) return null
  const raw = ref.trim().replace(/^@/, '').replace(/[.!,;:]+$/, '')
  if (!raw) return null
  const q = norm(raw)
  if (ME.test(q)) return selfId

  const email = /[^\s<>"'@]+@[^\s<>"'@]+/.exec(raw)?.[0]?.toLowerCase()
  if (email) {
    const m = people.filter((p) => p.email.toLowerCase() === email)
    return m.length === 1 ? m[0]!.id : null
  }

  const only = (list: OwnerCandidate[]): string | null | undefined => (list.length === 1 ? list[0]!.id : list.length > 1 ? null : undefined)
  const named = people.map((p) => ({ p, n: norm(p.name), tokens: norm(p.name).split(' ') }))

  const exact = only(named.filter((x) => x.n === q).map((x) => x.p))
  if (exact !== undefined) return exact
  const first = only(named.filter((x) => x.tokens[0] === q).map((x) => x.p))
  if (first !== undefined) return first
  const last = only(named.filter((x) => x.tokens.length > 1 && x.tokens[x.tokens.length - 1] === q).map((x) => x.p))
  if (last !== undefined) return last
  const qTokens = q.split(' ')
  const loose = only(named.filter((x) => qTokens.every((t) => x.tokens.some((nt) => nt.startsWith(t)))).map((x) => x.p))
  return loose === undefined ? null : loose
}
