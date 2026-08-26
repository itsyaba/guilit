"use client"

import { useState } from "react"
import { IconCheck } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

/**
 * Approve or reject one takedown, one tap, no confirm step. Neither action
 * deletes anything -- approve moves the listing to status `removed` and keeps
 * the row, reject leaves it live -- so a misclick is a row to correct rather
 * than something lost.
 */
export function RemovalActions({ id }: { id: number }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleAction(action: "approve" | "reject") {
    setLoading(true)
    try {
      await fetch(`/api/admin/removals/${id}/${action}`, {
        method: "POST",
      })
      setDone(true)
    } catch (err) {
      console.error(err)
      alert("Failed to process request")
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="type-ledger inline-flex items-center gap-2 rounded-full bg-tray px-3 py-2 text-muted-foreground ring-1 ring-hairline">
        <IconCheck aria-hidden="true" stroke={1.5} className="size-4" />
        Processed
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleAction("reject")}
        disabled={loading}
        className={cn(
          "inline-flex h-11 items-center justify-center rounded-full bg-card px-5 text-sm font-medium text-foreground",
          "ring-1 ring-hairline transition-[box-shadow,transform] duration-500 ease-fluid",
          "hover:shadow-hairline active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
        )}
      >
        Reject
      </button>
      <button
        onClick={() => handleAction("approve")}
        disabled={loading}
        className={cn(
          "inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground",
          "shadow-ambient transition-[box-shadow,transform] duration-500 ease-fluid",
          "hover:shadow-lift active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
        )}
      >
        Approve takedown
      </button>
    </div>
  )
}
