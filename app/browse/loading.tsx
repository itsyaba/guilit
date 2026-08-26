import { ListingGridSkeleton } from "@/components/listing/listing-card-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Mirrors app/browse/page.tsx frame for frame -- same measure, same 18rem
 * tray, same heading block -- so the shell does not move when the data lands.
 */
export default function BrowseLoading() {
  return (
    <div className="mx-auto max-w-[90rem] px-4 pt-6 pb-20 sm:px-6 lg:pt-10 lg:pb-28">
      <div className="lg:grid lg:grid-cols-[18rem_1fr] lg:gap-8 xl:gap-12">
        <aside className="hidden lg:block" aria-hidden="true">
          <div className="rounded-shell bg-tray p-2 ring-1 ring-hairline">
            <div className="space-y-7 rounded-panel bg-card p-5 shadow-ambient ring-1 ring-hairline">
              <Skeleton className="h-6 w-20 rounded-full" />
              {[5, 3, 3, 4].map((rows, index) => (
                <div key={index} className="space-y-2.5">
                  <Skeleton className="h-2.5 w-20" />
                  {Array.from({ length: rows }, (_, row) => (
                    <Skeleton key={row} className="h-4 w-full rounded-lg" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-4">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-9 w-72 max-w-full" />
              <Skeleton className="h-3 w-44" />
            </div>
            <div className="flex shrink-0 gap-2">
              <Skeleton className="h-11 w-28 rounded-full lg:hidden" />
              <Skeleton className="h-11 w-40 rounded-full" />
            </div>
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
