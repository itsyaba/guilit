import { formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Prices are always grouped and always carry ETB. A missing price occupies the
 * same slot at the same height, so a grid row never reflows around one.
 */
export function Price({
  value,
  size = "card",
  className,
}: {
  value: number | null
  size?: "card" | "detail"
  className?: string
}) {
  const detail = size === "detail"

  if (value === null) {
    return (
      <p
        className={cn(
          "flex items-center font-medium text-muted-foreground",
          detail ? "h-10 text-xl" : "h-7 text-base",
          className
        )}
      >
        Price on request
      </p>
    )
  }

  return (
    <p
      className={cn(
        "flex items-baseline gap-1 font-semibold tabular-nums",
        detail ? "h-10 text-[2rem] leading-10" : "h-7 text-lg leading-7",
        className
      )}
      style={{ letterSpacing: "-0.02em" }}
    >
      {formatAmount(value)}
      <span
        className={cn(
          "font-medium text-muted-foreground",
          detail ? "text-base" : "text-xs"
        )}
      >
        ETB
      </span>
    </p>
  )
}
