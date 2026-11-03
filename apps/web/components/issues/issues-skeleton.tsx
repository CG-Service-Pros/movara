import { Skeleton } from '@movara/ui/skeleton'

export function IssuesSkeleton() {
  return (
    <div className="flex w-full flex-col gap-1 p-4 sm:px-6 lg:px-8">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-11" />
      ))}
    </div>
  )
}
