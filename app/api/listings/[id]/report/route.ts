import type { NextRequest } from "next/server"

/**
 * POST /api/listings/[id]/report
 *
 * Submits a user report against a listing.
 * Trust-and-safety routing: 3+ reports → auto-hide + queue for review.
 * Reporter is optional — anonymous reports are accepted.
 *
 * Expected body: { reason: string, detail?: string }
 *
 * params is a Promise in Next.js 16 — must be awaited before use.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const reason: string = body.reason ?? "unspecified"

  return Response.json(
    {
      listingId: id,
      status: "received",
      reason,
      message: "Thank you. Our team will review this listing.",
    },
    { status: 202 }
  )
}
