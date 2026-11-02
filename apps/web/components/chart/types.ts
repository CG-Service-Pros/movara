export type SeatDTO = {
  id: string
  title: string
  parentSeatId: string | null
  responsibilities: string[]
  people: { id: string; name: string }[]
  agents: { id: string; name: string }[]
  linkedPriorityId: string | null
}
export type Named = { id: string; name: string }
export type PriorityOpt = { id: string; title: string }

export type TreeNode = SeatDTO & { children: TreeNode[]; depth: number }

/** Build a forest from a flat list (order of the list = sibling order). Orphans become roots. */
export function buildTree(seats: SeatDTO[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(seats.map((s) => [s.id, { ...s, children: [], depth: 0 }]))
  const roots: TreeNode[] = []
  for (const s of seats) {
    const n = byId.get(s.id)!
    const p = s.parentSeatId ? byId.get(s.parentSeatId) : undefined
    if (p) p.children.push(n)
    else roots.push(n)
  }
  const setDepth = (n: TreeNode, d: number) => {
    n.depth = d
    n.children.forEach((c) => setDepth(c, d + 1))
  }
  roots.forEach((r) => setDepth(r, 0))
  return roots
}

export const CARD_W = 208
export const H_GAP = 20
export const V_GAP = 56
const PAD = 24

/** Rough rendered height of a card, so that every card in a row can share one height. */
export function estimateHeight(s: SeatDTO): number {
  const lines = (t: string, per: number) => Math.max(1, Math.ceil(t.length / per))
  let h = 24 + lines(s.title, 22) * 18 + 8 + 20
  if (s.people.length > 1) h += 0
  if (s.responsibilities.length) h += 17 + s.responsibilities.reduce((a, r) => a + lines(r, 31) * 15 + 3, 0)
  if (s.agents.length) h += 8 + 9 + lines(`Assisted by ${s.agents.map((a) => a.name).join(', ')}`, 28) * 16
  if (s.linkedPriorityId) h += 8 + 28
  return Math.max(h, 96)
}

export type Placed = { node: TreeNode; x: number; y: number; h: number }
export type Layout = { placed: Placed[]; edges: { from: Placed; to: Placed[] }[]; width: number; height: number; rowH: number[] }

/** Tidy tree layout: subtrees laid out side by side, parents centered over their children. */
export function layoutTree(roots: TreeNode[]): Layout {
  const rowH: number[] = []
  const walk = (n: TreeNode) => {
    rowH[n.depth] = Math.max(rowH[n.depth] ?? 0, estimateHeight(n))
    n.children.forEach(walk)
  }
  roots.forEach(walk)
  const rowY: number[] = []
  let y = PAD
  rowH.forEach((h, i) => {
    rowY[i] = y
    y += h + V_GAP
  })
  const widthOf = new Map<string, number>()
  const w = (n: TreeNode): number => {
    const cw = n.children.reduce((a, c) => a + w(c), 0) + Math.max(0, n.children.length - 1) * H_GAP
    const r = Math.max(CARD_W, cw)
    widthOf.set(n.id, r)
    return r
  }
  const placed: Placed[] = []
  const byId = new Map<string, Placed>()
  const edges: Layout['edges'] = []
  const place = (n: TreeNode, left: number) => {
    const width = widthOf.get(n.id)!
    const p: Placed = { node: n, x: left + width / 2 - CARD_W / 2, y: rowY[n.depth]!, h: rowH[n.depth]! }
    placed.push(p)
    byId.set(n.id, p)
    const cw = n.children.reduce((a, c) => a + widthOf.get(c.id)!, 0) + Math.max(0, n.children.length - 1) * H_GAP
    let cx = left + (width - cw) / 2
    for (const c of n.children) {
      place(c, cx)
      cx += widthOf.get(c.id)! + H_GAP
    }
    if (n.children.length) edges.push({ from: p, to: n.children.map((c) => byId.get(c.id)!) })
  }
  let x = PAD
  for (const r of roots) {
    w(r)
    place(r, x)
    x += widthOf.get(r.id)! + H_GAP * 2
  }
  const width = Math.max(x - H_GAP * 2 + PAD, CARD_W + PAD * 2)
  return { placed, edges, width, height: Math.max(y - V_GAP + PAD, 120), rowH }
}
