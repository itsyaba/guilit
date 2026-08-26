import { listConversations } from "@/lib/messaging"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"

/**
 * GET /api/conversations
 *
 * The signed-in user's inbox, both roles in one list. The page at /messages
 * renders the same data server-side; this exists for the client-side refresh
 * and for anything that later wants the inbox without a page load.
 */
export async function GET() {
  let user
  try {
    user = await requireSessionUser()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not authenticated." }, { status: 401 })
    }
    throw error
  }

  const conversations = await listConversations(user.id)
  return Response.json({ conversations })
}
