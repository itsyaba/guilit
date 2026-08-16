import type { NextRequest } from "next/server"

/**
 * Typed shape for the admin channel list response.
 */
export type AdminChannel = {
  id: number
  telegramId: number
  username: string
  title: string
  active: boolean
  lastMessageId: number | null
  messageCount: number
  createdAt: string
}

const FIXTURE_CHANNELS: AdminChannel[] = [
  {
    id: 1,
    telegramId: -1001234567890,
    username: "addis_market",
    title: "Addis Market",
    active: true,
    lastMessageId: 4823,
    messageCount: 4823,
    createdAt: "2026-08-16T00:00:00Z",
  },
  {
    id: 2,
    telegramId: -1009876543210,
    username: "ethio_sells",
    title: "Ethio Sells",
    active: true,
    lastMessageId: 2107,
    messageCount: 2107,
    createdAt: "2026-08-16T00:00:00Z",
  },
]

/**
 * GET /api/admin/channels
 *
 * Returns the list of ingested channels with stats for the admin dashboard.
 */
export async function GET(_req: NextRequest) {
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
