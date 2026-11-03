'use client'

import { useState } from 'react'
import { Button } from '@movara/ui/button'
import { toast } from '@movara/ui/toaster'
import { startSeries } from '@/app/(app)/[org]/meetings/actions'

/** Starts the series' meeting (server action redirects into the live page). */
export function StartButton({ slug, seriesId, label = 'Start' }: { slug: string; seriesId: string; label?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size="sm"
      variant="primary"
      loading={busy}
      onClick={async () => {
        setBusy(true)
        const r = await startSeries(slug, seriesId)
        if (r && !r.ok) {
          setBusy(false)
          toast.error(r.error)
        }
      }}
    >
      {label}
    </Button>
  )
}
