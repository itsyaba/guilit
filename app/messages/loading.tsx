import { Skeleton } from "@/components/ui/skeleton"

/** Same measure and row geometry as the inbox, so nothing jumps on arrival. */
export default function MessagesLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-20 sm:px-6 lg:pt-10 lg:pb-28">
      <div className="mb-8 space-y-4">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-3 w-80 max-w-full" />
      </div>

      <span className="sr-only" role="status">
        Loading conversations
      </span>

      <ul className="space-y-2">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index}>
            <div className="flex items-center gap-4 rounded-shell bg-card p-3 ring-1 ring-hairline">
              <Skeleton className="size-16 shrink-0 rounded-panel" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-2.5 w-32" />
                <Skeleton className="h-3.5 w-4/5" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
