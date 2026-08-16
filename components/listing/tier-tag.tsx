import { IconCircleCheck } from "@tabler/icons-react"

import { TIER_DESCRIPTIONS, TIER_LABELS } from "@/lib/format"
import type { ListingTier } from "@/lib/types"
import { cn } from "@/lib/utils"

const TIER_STYLES: Record<ListingTier, string> = {
  indexed: "border-border/80 bg-background/90 text-muted-foreground",
  claimed: "border-primary/35 bg-background/90 text-primary",
  native: "border-transparent bg-primary text-primary-foreground",
}

/**
 * Which of the three states a listing is in. Deliberately small and never
 * celebratory: "Indexed" is a factual description of where the data came from,
 * not a badge of quality, and the copy must not imply otherwise.
 */
export function TierTag({
  tier,
  className,
}: {
  tier: ListingTier
  className?: string
}) {
  return (
    <span
      title={TIER_DESCRIPTIONS[tier]}
      className={cn(
        "type-ledger inline-flex h-[1.375rem] items-center gap-1 rounded-md border px-1.5 backdrop-blur-[2px]",
        TIER_STYLES[tier],
        className
      )}
    >
      {tier !== "indexed" ? (
        <IconCircleCheck aria-hidden="true" className="size-3" />
      ) : null}
      {TIER_LABELS[tier]}
    </span>
  )
}
