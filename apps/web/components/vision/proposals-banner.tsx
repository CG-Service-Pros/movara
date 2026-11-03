import Link from 'next/link'
import { ArrowRight, Inbox } from 'lucide-react'

/** "N proposed changes waiting for approval" -> the approvals inbox. Renders nothing for 0. */
export function ProposalsBanner({ count, org }: { count: number; org: string }) {
  if (count <= 0) return null
  return (
    <Link
      href={`/${org}/settings/approvals`}
      data-print-hide
      className="mb-4 flex w-full items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm font-[550] text-accent-text outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <Inbox size={15} strokeWidth={1.7} />
      {count} proposed {count === 1 ? 'change' : 'changes'} waiting for approval
      <ArrowRight size={14} strokeWidth={1.7} className="ml-auto" />
    </Link>
  )
}
