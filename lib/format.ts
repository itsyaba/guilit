import type { Lang } from "@/lib/i18n"
import type { ListingCondition, ListingTier } from "@/lib/types"

/**
 * All formatters pin their locale and time zone. Anything derived from the
 * viewer's environment would render differently on the server and the client
 * and trip hydration, so nothing here reads `new Date()` or the system locale.
 */

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Addis_Ababa",
})

const longDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Addis_Ababa",
})

const deadlineFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Africa/Addis_Ababa",
})

/** `12500` -> `"12,500"`. The unit is rendered separately so it can be styled down. */
export function formatAmount(value: number): string {
  return numberFormat.format(value)
}

/** `12500` -> `"12,500 ETB"`. Never a currency symbol, never a bare integer. */
export function formatPrice(value: number | null): string | null {
  return value === null ? null : `${numberFormat.format(value)} ETB`
}

export function formatShortDate(iso: string): string {
  return dateFormat.format(new Date(iso))
}

export function formatLongDate(iso: string): string {
  return longDateFormat.format(new Date(iso))
}

/**
 * `"Wed 24 Aug, 16:30"` — a hold's deadline.
 *
 * Weekday and clock time both matter here in a way they do not for a posting
 * date: the whole point of a 24-hour hold is knowing whether you can still get
 * there today. Pinned to Addis time like everything else in this file, because a
 * deadline that renders differently depending on the reader's device is worse
 * than no deadline.
 */
export function formatDeadline(iso: string): string {
  return deadlineFormat.format(new Date(iso))
}

/**
 * `"4 hours left"` / `"35 minutes left"` / `"lapsed"`.
 *
 * Takes `now` as an argument rather than calling `Date.now()` so a server render
 * and the hydrating client agree — the one thing the note at the top of this
 * file exists to prevent.
 */
export function formatTimeLeft(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return "lapsed"

  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} left`

  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} left`

  const days = Math.round(hours / 24)
  return `${days} days left`
}

export const CONDITION_LABELS: Record<ListingCondition, string> = {
  brand_new: "Brand New",
  lightly_used: "Lightly Used",
  fair: "Fair Condition",
}

const CONDITION_LABELS_AM: Record<ListingCondition, string> = {
  brand_new: "አዲስ",
  lightly_used: "ትንሽ ያገለገለ",
  fair: "መካከለኛ",
}

/** Condition in the reader's language. The three states the filters also use. */
export function conditionLabel(
  condition: ListingCondition,
  lang: Lang
): string {
  return lang === "am"
    ? CONDITION_LABELS_AM[condition]
    : CONDITION_LABELS[condition]
}

const TIER_LABELS_AM: Record<ListingTier, string> = {
  indexed: "የተሰበሰበ",
  claimed: "የተረጋገጠ",
  native: "በጉሊት የተለጠፈ",
}

export function tierLabel(tier: ListingTier, lang: Lang): string {
  return lang === "am" ? TIER_LABELS_AM[tier] : TIER_LABELS[tier]
}

const TIER_DESCRIPTIONS_AM: Record<ListingTier, string> = {
  indexed:
    "በቴሌግራም ቻናል ውስጥ ተገኝቶ እዚህ ተሰብስቧል። ግንኙነቱ ወደ መጀመሪያው ሻጭ ይሄዳል።",
  claimed: "ሻጩ በዚህ ልጥፍ ውስጥ ያለውን ስልክ ቁጥር በኤስኤምኤስ አረጋግጧል።",
  native: "በገባ ሻጭ በቀጥታ በጉሊት ተለጥፏል።",
}

export function tierDescription(tier: ListingTier, lang: Lang): string {
  return lang === "am" ? TIER_DESCRIPTIONS_AM[tier] : TIER_DESCRIPTIONS[tier]
}

export const TIER_LABELS: Record<ListingTier, string> = {
  indexed: "Indexed",
  claimed: "Claimed",
  native: "On Gulit",
}

export const TIER_DESCRIPTIONS: Record<ListingTier, string> = {
  indexed:
    "Found in a Telegram channel and indexed here. Contact goes to the original seller.",
  claimed: "The seller verified the phone number in this post over SMS.",
  native: "Posted directly on Gulit by a signed-in seller.",
}

/** `1` -> `"1 channel"`, `4` -> `"4 channels"`. */
export function formatChannelCount(count: number): string {
  return `${count} ${count === 1 ? "channel" : "channels"}`
}
