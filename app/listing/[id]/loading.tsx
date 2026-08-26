import { Skeleton } from "@/components/ui/skeleton"

/**
 * Same boxes, same sizes, same order as the real page — the gallery ratio in
 * particular, since that is the one element large enough to shift the fold, and
 * the tray around it, since that is what holds the space.
 */
export default function ListingLoading() {
  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-5 pb-20 sm:px-6 lg:pt-8 lg:pb-28">
      <span className="sr-only" role="status">
        Loading listing
      </span>

      <Skeleton className="h-8 w-32 rounded-full" />

      <div className="mt-5 flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div className="rounded-shell bg-tray p-2 ring-1 ring-hairline">
          <Skeleton className="aspect-4/3 w-full rounded-panel" />
          <div className="mt-2 flex gap-2 px-1">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="aspect-4/3 w-20 rounded-tile" />
            ))}
          </div>
        </div>

        <div className="space-y-4 lg:col-start-2 lg:row-span-2">
          <Frame>
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="mt-4 h-6 w-4/5" />
            <Skeleton className="mt-5 h-11 w-44" />
            <Skeleton className="mt-3 h-3 w-52" />
          </Frame>
          <Skeleton className="h-14 w-full rounded-full" />
          <Skeleton className="h-14 w-full rounded-full" />
          <Frame>
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="mt-4 h-4 w-full" />
            <Skeleton className="mt-6 h-2 w-full rounded-full" />
          </Frame>
        </div>

        <div className="space-y-10 lg:col-start-1 lg:row-start-2">
          <div>
            <Skeleton className="h-6 w-28 rounded-full" />
            <div className="mt-4 space-y-2.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <div>
            <Skeleton className="h-6 w-36 rounded-full" />
            <Skeleton className="mt-4 h-44 w-full rounded-shell" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** The tray-and-core enclosure, empty. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-shell bg-tray p-2 ring-1 ring-hairline">
      <div className="rounded-panel bg-card p-5 ring-1 ring-hairline sm:p-6">
        {children}
      </div>
    </div>
  )
}
