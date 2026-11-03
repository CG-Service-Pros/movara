import { Skeleton } from '@movara/ui/skeleton'

export function IssuesSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-1 p-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-11" />
      ))}
    </div>
  )
}
