'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from '@movara/ui/toaster'
import type { ActionResult } from '@/app/(app)/[org]/settings/actions'

/** Run a server action with pending state, toast feedback and a router refresh. */
export function useSave() {
  const router = useRouter()
  const [pending, start] = useTransition()
  function save<T>(fn: () => Promise<ActionResult<T>>, done: string, then?: (data: T | undefined) => void) {
    start(async () => {
      const r = await fn()
      if (!r.ok) return void toast.error(r.error)
      toast.success(r.pending ? 'Sent for approval' : done)
      if (!r.pending) then?.(r.data)
      router.refresh()
    })
  }
  return { save, pending }
}
