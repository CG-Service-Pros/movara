'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@movara/ui/button'
import { EmptyState } from '@movara/ui/empty-state'

/** Error boundary for every page under /{org}. Shows a calm message; never the stack trace. */
export default function OrgError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[movara] page error', error.digest ?? '')
  }, [error])
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <EmptyState
        icon={<AlertTriangle />}
        title="Something went wrong"
        description={error.digest ? `We could not load this page. Reference: ${error.digest}` : 'We could not load this page. Try again in a moment.'}
        action={<Button variant="primary" onClick={reset}>Try again</Button>}
      />
    </div>
  )
}
