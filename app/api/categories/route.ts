import type { NextRequest } from "next/server"
import type { CategoryOption } from "@/lib/types"

/**
 * GET /api/categories
 *
 * Returns the full category list for filter dropdowns and the browse nav.
 * Sourced from fixture data today; will query the categories table directly.
 */

const FIXTURE_CATEGORIES: CategoryOption[] = [
  { slug: "electronics", label: "Electronics", labelAm: "ኤሌክትሮኒክስ" },
  { slug: "phones", label: "Phones & Tablets", labelAm: "ስልኮችና ታብሌቶች" },
  { slug: "furniture", label: "Furniture", labelAm: "የቤት ዕቃዎች" },
  { slug: "clothing", label: "Clothing & Fashion", labelAm: "ልብስ" },
  { slug: "vehicles", label: "Vehicles", labelAm: "ተሽከርካሪዎች" },
  { slug: "appliances", label: "Home Appliances", labelAm: "የቤት መሳሪያዎች" },
  { slug: "books", label: "Books & Education", labelAm: "መጻሕፍት" },
  { slug: "sports", label: "Sports & Fitness", labelAm: "ስፖርት" },
  { slug: "baby", label: "Baby & Kids", labelAm: "ሕፃናት" },
  { slug: "other", label: "Other", labelAm: "ሌሎች" },
]

export async function GET(_req: NextRequest) {
  return Response.json(FIXTURE_CATEGORIES)
}
