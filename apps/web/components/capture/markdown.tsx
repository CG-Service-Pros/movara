import type { ReactNode } from 'react'

/** Inline: **bold**, *italic*, `code`, [text](http link). Everything else is plain text (never HTML). */
function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const k = `${key}${n++}`
    if (t.startsWith('**')) out.push(<strong key={k} className="font-[600] text-ink">{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={k} className="rounded-sm bg-canvas px-1 font-mono text-[0.9em]">{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\((.+)\)$/.exec(t)!
      out.push(<a key={k} href={mm[2]} target="_blank" rel="noreferrer noopener" className="text-accent-text underline underline-offset-2">{mm[1]}</a>)
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Minimal, safe markdown renderer for meeting notes: headings, bullet/numbered lists, paragraphs. */
export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`} className="text-base leading-relaxed text-body">{inline(para.join(' '), `p${blocks.length}`)}</p>)
    para = []
  }
  const flushList = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={`l${blocks.length}`} className={`flex flex-col gap-1 pl-5 text-base leading-relaxed text-body ${list.ordered ? 'list-decimal' : 'list-disc'} marker:text-faint`}>
        {list.items.map((t, i) => <li key={i}>{inline(t, `l${blocks.length}-${i}`)}</li>)}
      </Tag>,
    )
    list = null
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    const b = /^\s*[-*+]\s+(.*)$/.exec(line)
    const o = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (h) {
      flushPara(); flushList()
      const level = h[1]!.length
      blocks.push(<h4 key={`h${blocks.length}`} className={level <= 2 ? 'mt-1 text-base font-[600] text-ink' : 'mt-1 text-sm font-[600] text-ink'}>{inline(h[2]!, `h${blocks.length}`)}</h4>)
    } else if (b || o) {
      flushPara()
      const ordered = !!o
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      list.items.push((b ?? o)![1]!)
    } else if (!line.trim()) { flushPara(); flushList() }
    else { flushList(); para.push(line.trim()) }
  }
  flushPara(); flushList()
  return <div className="flex flex-col gap-2.5">{blocks}</div>
}
