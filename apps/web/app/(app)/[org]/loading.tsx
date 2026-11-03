import { Skeleton } from '@motion/ui/skeleton'

/** Default loading state for pages under /{org} (areas with their own loading.tsx override it). */
export default function Loading() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}
