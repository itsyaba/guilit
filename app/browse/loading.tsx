import { ListingGridSkeleton } from "@/components/listing/listing-card-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

export default function BrowseLoading() {
  return (
    <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:py-8">
      <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-10">
        <aside className="hidden space-y-7 lg:block" aria-hidden="true">
          {[5, 3, 3, 4].map((rows, index) => (
            <div key={index} className="space-y-2.5">
              <Skeleton className="h-2.5 w-20" />
              {Array.from({ length: rows }, (_, row) => (
                <Skeleton key={row} className="h-4 w-full" />
              ))}
            </div>
          ))}
        </aside>

        <section>
          <header className="mb-5 flex flex-wrap items-center gap-3">
            <div className="mr-auto space-y-2">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-36 rounded-lg" />
          </header>

          <span className="sr-only" role="status">
            Loading listings
          </span>
          <ListingGridSkeleton count={12} />
        </section>
      </div>
    </div>
  )
}
