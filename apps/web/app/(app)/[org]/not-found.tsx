import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { EmptyState } from '@motion/ui/empty-state'

/** 404 inside the app shell: unknown pages, ids that do not exist in this org, modules switched off. */
export default function OrgNotFound() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <EmptyState
        icon={<SearchX />}
        title="Page not found"
        description="It may have been deleted, or it is not part of this organization."
        action={<Link href="/" className="text-base font-medium text-accent hover:underline">Back to home</Link>}
      />
    </div>
  )
}
