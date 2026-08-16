"use client"

import { IconAlertTriangle } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

/**
 * Errors state what failed and what to do. They do not apologise, and they do
 * not hide the reference a support conversation would need.
 */
export function ErrorState({
  title,
  body,
  digest,
  onRetry,
}: {
  title: string
  body: string
  digest?: string
  onRetry: () => void
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <IconAlertTriangle
        aria-hidden="true"
        className="size-7 text-muted-foreground"
      />
      <h1 className="mt-4 text-lg font-semibold text-foreground">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
      <Button onClick={onRetry} className="mt-6 rounded-lg">
        Try again
      </Button>
      {digest ? (
        <p className="type-ledger mt-6 text-muted-foreground">ref {digest}</p>
      ) : null}
    </div>
  )
}
