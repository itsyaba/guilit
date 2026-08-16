"use client"

import { ErrorState } from "@/components/error-state"

export default function BrowseError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      title="Listings did not load"
      body="The index is reachable but this request came back empty. Trying again usually clears it. If it keeps happening, the ingestion service is likely mid-restart."
      digest={error.digest}
      onRetry={reset}
    />
  )
}
