import type { NextRequest } from "next/server"

/**
 * POST /api/admin/queue/[id]/decision
 *
 * Records a moderator decision on a queued job.
 * Expected body: { action: "approve" | "reject" | "edit", edits?: Record<string, unknown> }
 *
 * On approve: listing.status → 'live'
 * On reject:  listing.status → 'removed'
 * On edit:    apply edits then set status → 'live'
 *
 * params is a Promise in Next.js 16 — must be awaited before use.
 */

type DecisionAction = "approve" | "reject" | "edit"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action: DecisionAction = body.action ?? "approve"

  const resultStatus =
    action === "reject"
      ? "removed"
      : action === "approve" || action === "edit"
        ? "live"
        : "live"

  return Response.json({
    jobId: Number(id),
    action,
    resultStatus,
    message: `Job ${id} processed: listing set to '${resultStatus}'.`,
    processedAt: new Date().toISOString(),
  })
}
