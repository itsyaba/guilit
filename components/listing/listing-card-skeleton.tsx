import { Skeleton } from "@/components/ui/skeleton"

/**
 * Mirrors ListingCard slot for slot -- image ratio, price height, two title
 * lines, meta line, strip -- so nothing moves when real data replaces it.
 */
export function ListingCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-tile bg-card ring-1 ring-hairline">
      <Skeleton className="aspect-4/3 w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex h-7 items-center">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="min-h-[2lh] space-y-1.5 py-0.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/5" />
        </div>
        <div className="min-h-[1lh] py-0.5">
          <Skeleton className="h-2.5 w-2/5" />
        </div>
        <div className="mt-1 h-4 py-0.5">
          <Skeleton className="h-2.5 w-1/2" />
        </div>
        <div className="mt-auto flex h-5 items-center border-t border-hairline pt-2.5">
          <Skeleton className="h-2.5 w-3/5" />
        </div>
      </div>
    </div>
  )
}

export function ListingGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
    >
      {Array.from({ length: count }, (_, index) => (
        <ListingCardSkeleton key={index} />
      ))}
    </div>
  )
}
