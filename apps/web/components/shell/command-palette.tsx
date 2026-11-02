'use client'

import { Bot, CircleUser, Gauge, ListChecks, Newspaper, Plus, Target, TriangleAlert, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@motion/ui/command'
import { searchEntities, type PaletteHit } from './actions'
import { NavIcon } from './icons'
import type { PaletteItem } from './nav'

let openPalette: (() => void) | null = null
/** Open the palette from anywhere on the client (the sidebar search button uses this). */
export const openCommandPalette = () => openPalette?.()

const TYPE_ICON: Record<PaletteHit['type'], LucideIcon> = { priority: Target, metric: Gauge, issue: TriangleAlert, todo: ListChecks, headline: Newspaper, person: CircleUser, meeting: Users }

/** ⌘K palette: jump to pages, run "New …" quick actions, and search every entity (typed results). */
export function CommandPalette({ items, orgSlug }: { items: PaletteItem[]; orgSlug: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<{ q: string; list: PaletteHit[] }>({ q: '', list: [] })
  const seq = useRef(0)

  useEffect(() => {
    openPalette = () => setOpen(true)
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      openPalette = null
    }
  }, [])

  // Debounced server search; stale responses are dropped.
  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) return
    const id = ++seq.current
    const t = setTimeout(async () => {
      const list = await searchEntities(orgSlug, q).catch(() => [])
      if (id === seq.current) setHits({ q, list })
    }, 150)
    return () => clearTimeout(t)
  }, [query, open, orgSlug])

  const groups = useMemo(() => {
    const m = new Map<string, PaletteItem[]>()
    for (const i of items) m.set(i.group, [...(m.get(i.group) ?? []), i])
    return [...m.entries()]
  }, [items])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }
  const showHits = query.trim().length >= 2 ? hits.list : []
  const byType = new Map<string, PaletteHit[]>()
  for (const h of showHits) byType.set(h.typeLabel, [...(byType.get(h.typeLabel) ?? []), h])

  return (
    <CommandDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQuery(''); setHits({ q: '', list: [] }) } }}>
      <CommandInput placeholder="Search or jump to…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {[...byType.entries()].map(([label, list]) => (
          <CommandGroup key={label} heading={label}>
            {list.map((h) => {
              const Icon = TYPE_ICON[h.type]
              return (
                <CommandItem key={h.id} value={`${hits.q} ${h.typeLabel} ${h.title} ${h.id}`} onSelect={() => go(h.href)} data-hit={h.type}>
                  <Icon strokeWidth={1.7} />
                  <span className="truncate">{h.title}</span>
                  {h.subtitle && <span className="ml-auto truncate text-sm font-[450] text-faint">{h.subtitle}</span>}
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
        {groups.map(([group, list]) => (
          <CommandGroup key={group} heading={group}>
            {list.map((i) => (
              <CommandItem key={i.id} value={`${i.group} ${i.label}`} onSelect={() => go(i.href)}>
                {group === 'Create' ? <Plus strokeWidth={1.7} /> : i.icon === 'agents' ? <Bot strokeWidth={1.7} /> : <NavIcon name={i.icon} />}
                {i.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
