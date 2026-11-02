'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@motion/ui/command'
import { NavIcon } from './icons'
import type { PaletteItem } from './nav'

let openPalette: (() => void) | null = null
/** Open the palette from anywhere on the client (the sidebar search button uses this). */
export const openCommandPalette = () => openPalette?.()

/** ⌘K palette. For now it navigates; feature areas will add entity search later. */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

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

  const groups = useMemo(() => {
    const m = new Map<string, PaletteItem[]>()
    for (const i of items) m.set(i.group, [...(m.get(i.group) ?? []), i])
    return [...m.entries()]
  }, [items])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search or jump to…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {groups.map(([group, list]) => (
          <CommandGroup key={group} heading={group}>
            {list.map((i) => (
              <CommandItem
                key={i.id}
                value={`${i.group} ${i.label}`}
                onSelect={() => {
                  setOpen(false)
                  router.push(i.href)
                }}
              >
                <NavIcon name={i.icon} />
                {i.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
