import type { NextRequest } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/db/client"
import { channels, jobs } from "@/db/schema"
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/session"

export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 })
    if (err instanceof ForbiddenError) return Response.json({ error: "Forbidden" }, { status: 403 })
    throw err
  }

  const rows = await db.execute(sql`
    SELECT
      c.id, c.telegram_id AS "telegramId", c.username, c.title, c.active,
      c.last_message_id AS "lastMessageId", c.created_at AS "createdAt",
      COUNT(DISTINCT rm.id)::int AS "messagesCaptured",
      COUNT(DISTINCT ls.listing_id)::int AS "listingsExtracted",
      COUNT(DISTINCT ls.listing_id) FILTER (WHERE l.status = 'removed')::int AS rejections,
      ROUND(
        COUNT(DISTINCT ls.listing_id) FILTER (WHERE l.status = 'removed')::numeric
        / NULLIF(COUNT(DISTINCT ls.listing_id), 0) * 100, 1
      )::float AS "rejectionRatePct"
    FROM channels c
    LEFT JOIN raw_messages rm ON rm.channel_id = c.id
    LEFT JOIN listing_sources ls ON ls.raw_message_id = rm.id
    LEFT JOIN listings l ON l.id = ls.listing_id
    GROUP BY c.id
    ORDER BY c.id
  `)
  return Response.json(rows)
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 })
    if (err instanceof ForbiddenError) return Response.json({ error: "Forbidden" }, { status: 403 })
    throw err
  }

  const body = await request.json()
  let { username, telegramId, title } = body

  if (!username) {
    return Response.json({ error: "username is required" }, { status: 400 })
  }

  username = username.replace(/^@/, '')

  if (!telegramId) {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN
      if (botToken) {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=@${username}`)
        const data = await res.json()
        if (data.ok && data.result) {
          telegramId = data.result.id
          title = title || data.result.title
        }
      }
    } catch (err) {
      console.error("Failed to fetch telegram chat info", err)
    }
  }

  if (!telegramId) {
    return Response.json({ error: "Failed to resolve Telegram chat ID. Please provide telegramId explicitly." }, { status: 422 })
  }

  const [channel] = await db.insert(channels)
    .values({
      telegramId,
      username,
      title: title || username,
      active: true,
    })
    .onConflictDoUpdate({
      target: channels.telegramId,
      set: {
        active: true,
        username,
        updatedAt: new Date()
      }
    })
    .returning()

  await db.insert(jobs).values({
    type: 'backfill',
    payload: { channel_id: channel.id },
    status: 'pending'
  })

  return Response.json(channel, { status: 201 })
}
