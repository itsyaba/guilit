import type { NextRequest } from "next/server"
import fixtureChannels from "@/fixtures/channels.json"
import type { AdminChannel } from "@/lib/types"

export type { AdminChannel }

const FIXTURE_CHANNELS = fixtureChannels as unknown as AdminChannel[]

/**
 * GET /api/admin/channels
 *
 * Returns the list of ingested channels with stats for the admin dashboard.
 */
export async function GET() {
  return Response.json(FIXTURE_CHANNELS)
}

/**
 * POST /api/admin/channels
 *
 * Adds a new channel to the allowlist and triggers an initial backfill job.
 * Expected body: { username: string }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const username: string = body.username ?? ""

  return Response.json(
    {
      id: 3,
      username,
      title: username,
      active: true,
      lastMessageId: null,
      messageCount: 0,
      jobId: "stub-backfill-job-id",
      message: `Channel @${username} added. Backfill job queued.`,
      createdAt: new Date().toISOString(),
    },
    { status: 201 }
  )
}
