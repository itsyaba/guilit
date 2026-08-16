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

export const CONDITION_LABELS: Record<ListingCondition, string> = {
  brand_new: "Brand New",
  lightly_used: "Lightly Used",
  fair: "Fair Condition",
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
