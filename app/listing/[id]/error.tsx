"use client"

import { ErrorState } from "@/components/error-state"

export default function ListingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      title="This listing did not load"
      body="Something failed between the index and this page. Try again, or go back to browse and open it from there."
      digest={error.digest}
      onRetry={reset}
    />
  )
}
