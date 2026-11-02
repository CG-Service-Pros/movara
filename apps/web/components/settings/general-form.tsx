'use client'

import { useState } from 'react'
import { Button } from '@motion/ui/button'
import { Field } from '@motion/ui/field'
import { Input } from '@motion/ui/input'
import { updateGeneral } from '@/app/(app)/[org]/settings/actions'
import { Panel } from './ui'
import { useSave } from './use-save'

export const TIMEZONES: string[] = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? ['UTC']

export function GeneralForm({ slug, name, timezone, canEdit }: { slug: string; name: string; timezone: string; canEdit: boolean }) {
  const [n, setN] = useState(name)
  const [tz, setTz] = useState(timezone)
  const { save, pending } = useSave()
  const dirty = n !== name || tz !== timezone
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save(() => updateGeneral(slug, { name: n, timezone: tz }), 'Saved')
      }}
    >
      <Panel className="divide-y-0">
        <div className="flex flex-col gap-4 p-4">
          <Field label="Organization name" htmlFor="org-name">
            <Input id="org-name" value={n} onChange={(e) => setN(e.target.value)} disabled={!canEdit} maxLength={80} />
          </Field>
          <Field label="URL slug" htmlFor="org-slug" hint="The slug is part of every link and cannot be changed.">
            <Input id="org-slug" value={slug} readOnly disabled />
          </Field>
          <Field label="Timezone" htmlFor="org-tz" hint="Used for meeting times, due dates and the quarter calendar.">
            <Input id="org-tz" list="tz-list" value={tz} onChange={(e) => setTz(e.target.value)} disabled={!canEdit} />
            <datalist id="tz-list">{TIMEZONES.map((z) => <option key={z} value={z} />)}</datalist>
          </Field>
        </div>
      </Panel>
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!dirty || !n.trim()} loading={pending}>Save changes</Button>
        </div>
      ) : (
        <p className="text-sm text-faint">Only admins can change organization settings.</p>
      )}
    </form>
  )
}
