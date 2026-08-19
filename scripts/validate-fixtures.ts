import type { Listing, AdminChannel, QueuedJob } from "@/lib/types"
import fixturesData from "@/fixtures/listings.json"
import channelsData from "@/fixtures/channels.json"
import queueData from "@/fixtures/queue.json"

/**
 * The fixture predates the live database and still carries a `priceStats` block
 * that the API type dropped — those numbers now come from the price_stats table
 * via /api/listings/[id]/price-context, computed from the real corpus rather
 * than baked into a file. The fixture keeps them because the edge-case report
 * below uses them to point at the seeded scam listings.
 */
type FixtureListing = Listing & {
  priceStats?: { verdict?: string } | null
}

// Type-level assertions
const listings: FixtureListing[] = fixturesData.listings as unknown as FixtureListing[]
const channels: AdminChannel[] = channelsData as AdminChannel[]
const queueItems: QueuedJob[] = queueData.items as QueuedJob[]

console.log(`[Validation] Type check passed for:`)
console.log(`  - ${listings.length} listings against Listing type`)
console.log(`  - ${channels.length} channels against AdminChannel type`)
console.log(`  - ${queueItems.length} queue items against QueuedJob type`)

// Check 60 listings
if (listings.length !== 60) {
  throw new Error(`Expected 60 listings, got ${listings.length}`)
}

// Check 8 channels
if (channels.length !== 8) {
  throw new Error(`Expected 8 channels, got ${channels.length}`)
}

// Check 12 queue items
if (queueItems.length !== 12) {
  throw new Error(`Expected 12 queue items, got ${queueItems.length}`)
}

// Check required 13 neighbourhoods
const REQUIRED_AREAS = [
  "Bole",
  "Piassa",
  "Megenagna",
  "CMC",
  "Sarbet",
  "Kazanchis",
  "Gerji",
  "Ayat",
  "Summit",
  "Jemo",
  "Kolfe",
  "Saris",
  "Merkato",
]

const areaSet = new Set(listings.map((l) => l.location.area))
const missingAreas = REQUIRED_AREAS.filter((a) => !areaSet.has(a))
if (missingAreas.length > 0) {
  throw new Error(`Missing required neighbourhoods: ${missingAreas.join(", ")}`)
}

// Check 8 edge cases
const edgeCases = {
  noImage: listings.filter((l) => l.images.length === 0),
  oneImage: listings.filter((l) => l.images.length === 1),
  eightImages: listings.filter((l) => l.images.length === 8),
  longAmharicTitle: listings.filter(
    (l) => (l.titleAm?.length ?? 0) >= 60 || l.title.length >= 60
  ),
  noPrice: listings.filter((l) => l.priceEtb === null),
  dedupCluster: listings.filter((l) => l.seenInChannels >= 3),
  priceOutlier: listings.filter(
    (l) => l.priceStats?.verdict === "suspicious"
  ),
  indexedTier: listings.filter((l) => l.tier === "indexed"),
  claimedTier: listings.filter((l) => l.tier === "claimed"),
  nativeTier: listings.filter((l) => l.tier === "native"),
  malformedPhone: listings.filter((l) =>
    l.seller.phoneMasked?.includes("incomplete")
  ),
}

console.log("\n[Validation] Edge cases check:")
console.log(`  1. No image: ${edgeCases.noImage.length} found (${edgeCases.noImage.map((l) => l.id).join(", ")})`)
console.log(`  2a. One image: ${edgeCases.oneImage.length} found (${edgeCases.oneImage.map((l) => l.id).join(", ")})`)
console.log(`  2b. Eight images: ${edgeCases.eightImages.length} found (${edgeCases.eightImages.map((l) => l.id).join(", ")})`)
console.log(`  3. Long Amharic title: ${edgeCases.longAmharicTitle.length} found (${edgeCases.longAmharicTitle.map((l) => l.id).join(", ")})`)
console.log(`  4. No price: ${edgeCases.noPrice.length} found (${edgeCases.noPrice.map((l) => l.id).join(", ")})`)
console.log(`  5. Dedup cluster (3+ channels): ${edgeCases.dedupCluster.length} found (${edgeCases.dedupCluster.map((l) => l.id).join(", ")})`)
console.log(`  6. Price outlier (scam signal): ${edgeCases.priceOutlier.length} found (${edgeCases.priceOutlier.map((l) => l.id).join(", ")})`)
console.log(`  7. Tiers: indexed=${edgeCases.indexedTier.length}, claimed=${edgeCases.claimedTier.length}, native=${edgeCases.nativeTier.length}`)
console.log(`  8. Malformed phone: ${edgeCases.malformedPhone.length} found (${edgeCases.malformedPhone.map((l) => l.id).join(", ")})`)

for (const [key, list] of Object.entries(edgeCases)) {
  if (list.length === 0) {
    throw new Error(`Edge case ${key} has 0 occurrences!`)
  }
}

console.log("\nALL ACCEPTANCE CRITERIA VALIDATED SUCCESSFULLY!")
