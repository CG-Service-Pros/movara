/**
 * Same-origin redirect guard for `?next=`. Returns `next` only if it is a plain relative path ("/foo?x=1");
 * anything else (scheme, `//host`, `/\\host`, encoded variants, control chars) yields `fallback`.
 */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (typeof next !== 'string' || next.length === 0 || next.length > 2048) return fallback
  // Decode up to a few times so %2f%2f, %5c, %252f etc. are judged in their final form too.
  let cur = next
  for (let i = 0; i < 4; i++) {
    if (!isSafeForm(cur)) return fallback
    let dec: string
    try {
      dec = decodeURIComponent(cur)
    } catch {
      return fallback
    }
    if (dec === cur) break
    cur = dec
  }
  if (!isSafeForm(cur)) return fallback
  // Final authority: resolve against a dummy origin and require it not to leave.
  try {
    const base = 'http://motion.invalid'
    if (new URL(next, base).origin !== base) return fallback
  } catch {
    return fallback
  }
  return next
}

function isSafeForm(s: string): boolean {
  if (!s.startsWith('/')) return false
  if (s.startsWith('//') || s[1] === '\\') return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(s)) return false
  return true
}
