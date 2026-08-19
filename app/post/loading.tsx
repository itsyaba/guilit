import { Skeleton } from "@/components/ui/skeleton"

export default function PostLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-8 space-y-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-full max-w-md" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="aspect-4/3 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
