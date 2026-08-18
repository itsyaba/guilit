"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

type State = "idle" | "pending" | "done" | "error"

/** "This is mine, remove it" — one tap, no reason asked. See app/api/listings/[id]/remove. */
export function RemoveListingButton({ listingId }: { listingId: string }) {
  const router = useRouter()
  const [state, setState] = React.useState<State>("idle")

  async function remove() {
    setState("pending")
    const res = await fetch(`/api/listings/${listingId}/remove`, { method: "POST" })
    if (res.ok) {
      setState("done")
      router.refresh()
    } else {
      setState("error")
    }
  }

  if (state === "done") {
    return (
      <p className="text-sm text-foreground">
        Removed — this listing will drop off the index shortly.
      </p>
    )
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={remove}
        disabled={state === "pending"}
        className="text-sm text-destructive underline underline-offset-4 disabled:opacity-50"
      >
        {state === "pending" ? "Removing…" : "This is mine, remove it"}
      </button>
      {state === "error" ? (
        <p className="text-sm text-destructive">Could not remove it. Try again.</p>
      ) : null}
    </div>
  )
}
