import { Skeleton } from "@/components/ui/skeleton"

/**
 * Same boxes, same sizes, same order as the real page — the gallery ratio in
 * particular, since that is the one element large enough to shift the fold.
 */
export default function ListingLoading() {
  return (
    <div className="mx-auto max-w-[80rem] px-4 py-5 sm:px-6 lg:py-8">
      <span className="sr-only" role="status">
        Loading listing
      </span>

      <Skeleton className="h-3 w-28" />

      <div className="mt-4 flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div>
          <Skeleton className="aspect-4/3 w-full rounded-lg" />
          <div className="mt-3 flex gap-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="aspect-4/3 w-20 rounded-md" />
            ))}
          </div>
        </div>

        <div className="space-y-5 lg:col-start-2 lg:row-span-2">
          <div className="space-y-3">
            <Skeleton className="h-[1.375rem] w-20 rounded-md" />
            <Skeleton className="h-7 w-4/5" />
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-44 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>

        <div className="space-y-8 lg:col-start-1 lg:row-start-2">
          <div className="space-y-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="space-y-2.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}
