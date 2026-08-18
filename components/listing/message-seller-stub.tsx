"use client"

import * as React from "react"
import { IconMessageCircle } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

/**
 * Native listings have no Telegram source to fall back on and no in-app
 * messaging built yet. Honest stub rather than a dead link — see README's
 * "be honest about verification limits" principle.
 */
export function MessageSellerStub() {
  const [shown, setShown] = React.useState(false)

  return (
    <div className="space-y-2">
      <Button
        size="lg"
        variant="outline"
        className="h-12 w-full rounded-lg text-base"
        onClick={() => setShown(true)}
      >
        <IconMessageCircle aria-hidden="true" className="size-5" />
        Message the seller
      </Button>
      {shown ? (
        <p className="text-sm text-muted-foreground">
          In-app messaging isn&apos;t built yet — this is a placeholder for the
          native posting flow.
        </p>
      ) : null}
    </div>
  )
}
