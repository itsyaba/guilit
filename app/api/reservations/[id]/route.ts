import type { NextRequest } from "next/server"

import { closeHold } from "@/lib/reservations"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import { isUuid } from "@/lib/utils"

/**
 * POST /api/reservations/[id]
 *
 * Ends a hold. Expected body: { outcome: "completed" | "cancelled" }
 *
 * `completed` is the seller saying the handover happened, which is the only
 * signal we have that a peer-to-peer sale closed — we are not in the room. Only
 * the seller may send it, because a buyer able to mark their own purchase
 * complete could release a hold they never collected. `cancelled` is open to
 * either side: both of them can decide not to go through with it, and making
 * the buyer chase the seller to get their deposit released would be the wrong
 * default.
 *
 * Permission checks live in lib/reservations.closeHold so that the rule is
 * stated once next to the state machine it guards.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isUuid(id)) {
    return Response.json({ error: "Reservation not found." }, { status: 404 })
  }

  let user
  try {
    user = await requireSessionUser()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not authenticated." }, { status: 401 })
    }
    throw error
  }

  const body = await request.json().catch(() => null)
  const outcome = body?.outcome
  if (outcome !== "completed" && outcome !== "cancelled") {
    return Response.json(
      { error: "outcome must be 'completed' or 'cancelled'." },
      { status: 400 }
    )
  }

  const updated = await closeHold(id, user.id, outcome)
  // Null covers both "no such hold" and "not yours to close" — the same answer,
  // for the same reason the conversation routes give one.
  if (!updated) {
    return Response.json({ error: "Reservation not found." }, { status: 404 })
  }

  return Response.json({ id: updated.id, status: updated.status })
}
