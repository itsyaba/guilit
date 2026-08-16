import fixtureQueue from "@/fixtures/queue.json"
import type { QueuedJob } from "@/lib/types"

export type { QueuedJob }

type QueuePayload = {
  items: QueuedJob[]
  total: number
}

const FIXTURE_QUEUE = fixtureQueue as unknown as QueuePayload

/**
 * GET /api/admin/queue
 *
 * Returns pending moderation jobs for the admin dashboard.
 * The moderator sees the original Telegram message alongside extracted fields
 * and can approve / edit / reject in one click.
 */
export async function GET() {
  return Response.json(FIXTURE_QUEUE)
}
