import { IconCircleCheck } from "@tabler/icons-react"

import { tierDescription, tierLabel } from "@/lib/format"
import { getLang } from "@/lib/i18n"
import type { ListingTier } from "@/lib/types"
import { cn } from "@/lib/utils"

const TIER_STYLES: Record<ListingTier, string> = {
  indexed: "bg-background/90 text-muted-foreground ring-1 ring-hairline",
  claimed: "bg-background/90 text-primary ring-1 ring-primary/30",
  native: "bg-primary text-primary-foreground",
}

/**
 * Which of the three states a listing is in. Deliberately small and never
 * celebratory: "Indexed" is a factual description of where the data came from,
 * not a badge of quality, and the copy must not imply otherwise.
 *
 * Reads the language itself rather than taking it as a prop. The tag appears on
 * every card in the app and inside a detail page, and threading a `lang` down
 * four levels to reach it would guarantee one call site forgets and leaves an
 * English badge sitting on an Amharic page.
 */
export async function TierTag({
  tier,
  className,
}: {
  tier: ListingTier
  className?: string
}) {
  const lang = await getLang()

  return (
    <span
      title={tierDescription(tier, lang)}
      className={cn(
        "type-ledger inline-flex h-6 items-center gap-1 rounded-full px-2.5 backdrop-blur-[2px]",
        TIER_STYLES[tier],
        className
      )}
    >
      {tier !== "indexed" ? (
        <IconCircleCheck aria-hidden="true" stroke={1.5} className="size-3.5" />
      ) : null}
      {tierLabel(tier, lang)}
    </span>
  )
}
