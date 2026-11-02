import { Skeleton } from '@motion/ui/skeleton'
import { Page } from '@/components/shell/page'

export default function Loading() {
  return (
    <Page title={<Skeleton className="h-4 w-24" />}>
      <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="p-5">
          <div className="flex items-center gap-5 pb-5">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-1.5 flex-1" />
          </div>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex h-11 items-center gap-3 border-t border-line-faint">
              <Skeleton className="size-3.5 rounded-full" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-1 w-11" />
              <Skeleton className="size-5 rounded-full" />
            </div>
          ))}
        </div>
        <div className="hidden space-y-4 border-l border-line p-5 lg:block">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </Page>
  )
}
