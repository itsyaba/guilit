"use client"

import { ErrorState } from "@/components/error-state"

export default function PostError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      title="The posting form did not load"
      body="Your draft is saved locally, so nothing you typed is lost. Try again — if it keeps failing, the database is likely mid-restart."
      digest={error.digest}
      onRetry={reset}
    />
  )
}
