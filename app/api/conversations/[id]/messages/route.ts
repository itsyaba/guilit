import type { NextRequest } from "next/server"

import {
  getMessagesSince,
  MESSAGE_MAX_CHARS,
  markThreadRead,
  notifyCounterpart,
  postMessage,
} from "@/lib/messaging"
import { checkRateLimit } from "@/lib/rate-limit"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import { isUuid } from "@/lib/utils"

/**
 * GET /api/conversations/[id]/messages?since=<iso>
 *
 * The thread's tail. This is a poll, not a socket: two people arranging to meet
 * about a sofa do not need sub-second delivery, and a WebSocket would mean a
 * stateful server in a deployment whose whole selling point is that it is three
 * containers anyone can `docker compose up`.
 *
 * `since` keeps the response empty in the common case, which is what makes a
 * 6-second interval affordable on a metered mobile connection.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isUuid(id)) {
    return Response.json({ error: "Conversation not found." }, { status: 404 })
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

  const raw = request.nextUrl.searchParams.get("since")
  const since = raw ? new Date(raw) : null
  const validSince = since && !Number.isNaN(since.getTime()) ? since : null

  const messages = await getMessagesSince(id, user.id, validSince)
  // Null means "not found or not yours" — the same answer on purpose, so a
  // guessed id cannot be used to discover that a thread exists.
  if (messages === null) {
    return Response.json({ error: "Conversation not found." }, { status: 404 })
  }

  // Polling the thread is looking at it. Anything the other side sent is read.
  if (messages.some((message) => message.author !== "me")) {
    await markThreadRead(id, user.id)
  }

  return Response.json({ messages })
}

/**
 * POST /api/conversations/[id]/messages
 *
 * A reply from either side. Expected body: { body: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isUuid(id)) {
    return Response.json({ error: "Conversation not found." }, { status: 404 })
  }

  let user
  try {
    user = await requireSessionUser()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Log in to send a message." },
        { status: 401 }
      )
    }
    throw error
  }

  const allowed = await checkRateLimit(`message:${user.id}`, 40, 60 * 60)
  if (!allowed) {
    return Response.json(
      { error: "That's a lot of messages at once. Try again in an hour." },
      { status: 429 }
    )
  }

  const payload = await request.json().catch(() => null)
  const body = typeof payload?.body === "string" ? payload.body.trim() : ""
  if (!body) {
    return Response.json({ error: "Write a message first." }, { status: 400 })
  }
  if (body.length > MESSAGE_MAX_CHARS) {
    return Response.json(
      { error: `Keep it under ${MESSAGE_MAX_CHARS} characters.` },
      { status: 400 }
    )
  }

  /**
   * Membership is checked by reading the thread as this user first — the same
   * "null means either missing or not yours" contract as the GET. Without this
   * a stranger with a conversation id could write into someone else's thread.
   */
  const readable = await getMessagesSince(id, user.id, new Date())
  if (readable === null) {
    return Response.json({ error: "Conversation not found." }, { status: 404 })
  }

  const message = await postMessage({
    conversationId: id,
    senderId: user.id,
    body,
  })

  void notifyCounterpart(id, user.id, body)

  return Response.json({ message }, { status: 201 })
}
