import { Skeleton } from "@/components/ui/skeleton"

/**
 * Mirrors app/post/page.tsx: same measure, same heading block, same step rail,
 * then the photo panel's own enclosure.
 */
export default function PostLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-16 sm:px-6 lg:pt-12">
      <div className="max-w-xl">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="mt-4 h-9 w-64" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-3/4" />
      </div>

      <div className="mt-10 flex gap-2" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-9 w-28 rounded-full" />
        ))}
      </div>

      <div className="mt-8 rounded-shell bg-tray p-2 ring-1 ring-hairline">
        <div className="rounded-panel bg-card p-6 shadow-ambient ring-1 ring-hairline">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="mt-4 h-6 w-32" />
          <Skeleton className="mt-3 h-4 w-full max-w-md" />
          <Skeleton className="mt-6 h-48 w-full rounded-panel" />
          <Skeleton className="mt-6 h-11 w-32 rounded-full" />
        </div>
      </div>

      <span className="sr-only" role="status">
        Loading the posting form
      </span>
    </div>
  )
}
