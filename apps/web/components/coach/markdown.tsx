import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@movara/ui/cn'

/**
 * A small, safe markdown renderer for Coach replies (no HTML passthrough, no dependencies).
 * Supports headings, bold/italic, inline code, code fences, bullet and numbered lists, blockquotes and links.
 * Links to the app (`/org/...`) navigate client-side; only https/mailto links are otherwise allowed.
 */
export function Markdown({ text, className, onNavigate }: { text: string; className?: string; onNavigate?: () => void }) {
  return <div className={cn('space-y-2 text-sm leading-[1.55] text-ink [&_a]:text-accent-text', className)}>{blocks(text, onNavigate)}</div>
}

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|(?<![*\w])\*[^*\n]+\*(?!\*))/g

function inline(text: string, onNavigate?: () => void): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(INLINE)) {
    const s = m[0]
    if (m.index! > last) out.push(text.slice(last, m.index))
    const k = `${i++}`
    if (s.startsWith('**')) out.push(<strong key={k} className="font-[620]">{inline(s.slice(2, -2), onNavigate)}</strong>)
    else if (s.startsWith('`')) out.push(<code key={k} className="rounded bg-canvas px-1 py-px font-mono text-[12px]">{s.slice(1, -1)}</code>)
    else if (s.startsWith('[')) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(s)!
      if (href!.startsWith('/') && !href!.startsWith('//')) {
        out.push(<Link key={k} href={href!} onClick={onNavigate} className="font-[550] underline decoration-accent-text/30 underline-offset-2 hover:decoration-accent-text">{label}</Link>)
      } else if (/^(https:\/\/|mailto:)/.test(href!)) {
        out.push(<a key={k} href={href} target="_blank" rel="noopener noreferrer" className="font-[550] underline underline-offset-2">{label}</a>)
      } else out.push(label)
    } else out.push(<em key={k}>{s.slice(1, -1)}</em>)
    last = m.index! + s.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function blocks(src: string, onNavigate?: () => void): ReactNode[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) { i++; continue }
    if (line.startsWith('```')) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) body.push(lines[i++]!)
      i++
      out.push(<pre key={key++} className="overflow-x-auto rounded-md bg-canvas p-2.5 font-mono text-[12px] leading-5">{body.join('\n')}</pre>)
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      out.push(<div key={key++} className="pt-1 text-sm font-[650] text-ink">{inline(h[2]!, onNavigate)}</div>)
      i++
      continue
    }
    if (/^\s*([-*•])\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*([-*•])\s+/, ''))
      out.push(<ul key={key++} className="list-disc space-y-1 pl-4 marker:text-faint">{items.map((t, n) => <li key={n}>{inline(t, onNavigate)}</li>)}</ul>)
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*\d+[.)]\s+/, ''))
      out.push(<ol key={key++} className="list-decimal space-y-1 pl-4 marker:text-faint">{items.map((t, n) => <li key={n}>{inline(t, onNavigate)}</li>)}</ol>)
      continue
    }
    if (line.startsWith('>')) {
      const q: string[] = []
      while (i < lines.length && lines[i]!.startsWith('>')) q.push(lines[i++]!.replace(/^>\s?/, ''))
      out.push(<blockquote key={key++} className="border-l-2 border-line pl-3 text-body">{inline(q.join(' '), onNavigate)}</blockquote>)
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i]!.trim() && !/^(```|#{1,4}\s|\s*([-*•]|\d+[.)])\s|>)/.test(lines[i]!)) para.push(lines[i++]!)
    out.push(
      <p key={key++}>
        {para.map((l, n) => (
          <Fragment key={n}>{n > 0 && <br />}{inline(l, onNavigate)}</Fragment>
        ))}
      </p>,
    )
  }
  return out
}
