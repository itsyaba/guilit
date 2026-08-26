"use client"

import { IconAlertTriangle } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-tray ring-1 ring-hairline"
      >
        <IconAlertTriangle
          stroke={1.5}
          className="size-6 text-muted-foreground"
        />
      </span>
      <h1 className="type-display mt-6 text-xl font-semibold text-foreground">
        {title}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        {body}
      </p>
      <Button
        onClick={onRetry}
        className={cn(
          "mt-8 h-11 rounded-full px-6 shadow-ambient",
          "transition-[transform,box-shadow] duration-500 ease-fluid",
          "hover:shadow-lift active:scale-[0.985]"
        )}
      >
        Try again
      </Button>
      {digest ? (
        <p className="type-ledger mt-6 text-muted-foreground">ref {digest}</p>
      ) : null}
    </div>
  )
}
