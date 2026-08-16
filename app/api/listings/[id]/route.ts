import type { NextRequest } from "next/server"
import { getListing } from "@/lib/listings"

/**
 * GET /api/listings/[id]
 *
 * Returns the full listing detail object for the given id.
 * params is a Promise in Next.js 16 — must be awaited before use.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const listing = await getListing(id)

  if (!listing) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }

  return Response.json(listing)
}
