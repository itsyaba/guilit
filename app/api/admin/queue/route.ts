import type { NextRequest } from "next/server"

/**
 * Typed shape for a job in the moderation queue.
 */
export type QueuedJob = {
  id: number
  type: string
  status: "pending" | "running" | "done" | "failed"
  listingId: string | null
  rawMessageId: number | null
  attempts: number
  runAfter: string
  createdAt: string
  payload: Record<string, unknown>
}

const FIXTURE_QUEUE: QueuedJob[] = [
  {
    id: 1,
    type: "moderate",
    status: "pending",
    listingId: "fixture-listing-id-1",
    rawMessageId: 101,
    attempts: 0,
    runAfter: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    payload: { reason: "low_confidence", confidence: 0.61 },
  },
  {
    id: 2,
    type: "moderate",
    status: "pending",
    listingId: "fixture-listing-id-2",
    rawMessageId: 204,
    attempts: 0,
    runAfter: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    payload: { reason: "price_outlier", confidence: 0.89 },
  },
]

/**
 * GET /api/admin/queue
 *
 * Returns pending moderation jobs for the admin dashboard.
 * The moderator sees the original Telegram message alongside extracted fields
 * and can approve / edit / reject in one click.
 */
export async function GET(_req: NextRequest) {
  return Response.json({ items: FIXTURE_QUEUE, total: FIXTURE_QUEUE.length })
}
