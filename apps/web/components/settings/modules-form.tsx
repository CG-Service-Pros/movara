'use client'

import { useState } from 'react'
import { Switch } from '@motion/ui/switch'
import { updateModules } from '@/app/(app)/[org]/settings/actions'
import { Panel } from './ui'
import { useSave } from './use-save'

export type ModuleRow = { key: string; label: string; description: string; enabled: boolean }

export function ModulesForm({ slug, modules, canEdit }: { slug: string; modules: ModuleRow[]; canEdit: boolean }) {
  const [state, setState] = useState(Object.fromEntries(modules.map((m) => [m.key, m.enabled])))
  const { save, pending } = useSave()
  return (
    <Panel>
      {modules.map((m) => (
        <div key={m.key} className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <label htmlFor={`mod-${m.key}`} className="text-base font-[550] text-ink">{m.label}</label>
            <p className="text-sm text-body">{m.description}</p>
          </div>
          <Switch
            id={`mod-${m.key}`}
            checked={state[m.key]}
            disabled={!canEdit || pending}
            onCheckedChange={(v) => {
              setState((s) => ({ ...s, [m.key]: v }))
              save(() => updateModules(slug, { [m.key]: v }), v ? `${m.label} enabled` : `${m.label} hidden`)
            }}
          />
        </div>
      ))}
    </Panel>
  )
}
