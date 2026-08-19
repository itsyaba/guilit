import { asc } from "drizzle-orm"

import { db } from "@/db/client"
import { categories } from "@/db/schema"
import type { CategoryOption } from "@/lib/types"

/**
 * GET /api/categories
 *
 * Returns the full category list for filter dropdowns, the browse nav, and the
 * native posting form. The categories table is the single source of truth —
 * listings.category_slug is an FK against it, so any slug this route invents
 * would be rejected at insert time.
 */
export async function GET() {
  const rows = await db
    .select({
      slug: categories.slug,
      label: categories.nameEn,
      labelAm: categories.nameAm,
    })
    .from(categories)
    .orderBy(asc(categories.nameEn))

  return Response.json(rows satisfies CategoryOption[])
}
