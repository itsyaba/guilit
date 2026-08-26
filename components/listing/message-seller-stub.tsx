"use client"

import * as React from "react"
import { IconMessageCircle } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

/**
 * Native listings have no Telegram source to fall back on and no in-app
 * messaging built yet. Honest stub rather than a dead link — see README's
 * "be honest about verification limits" principle.
 */
export function MessageSellerStub() {
  const [shown, setShown] = React.useState(false)

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setShown(true)}
        className={cn(
          "group/act flex h-14 w-full items-center gap-3 rounded-full bg-card pr-6 pl-2 text-base font-medium text-foreground",
          "shadow-hairline ring-1 ring-hairline",
          "transition-[transform,box-shadow] duration-500 ease-fluid",
          "hover:shadow-ambient active:scale-[0.99]",
          "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tray transition-transform duration-500 ease-fluid group-hover/act:scale-105"
        >
          <IconMessageCircle stroke={1.5} className="size-5" />
        </span>
        Message the seller
      </button>
      {shown ? (
        <p className="rounded-tile bg-tray px-4 py-3 text-sm leading-relaxed text-muted-foreground ring-1 ring-hairline">
          In-app messaging isn&apos;t built yet — this is a placeholder for the
          native posting flow.
        </p>
      ) : null}
    </div>
  )
}
