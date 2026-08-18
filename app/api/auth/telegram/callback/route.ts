import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { db } from "@/db/client"
import { users } from "@/db/schema"
import { attachSessionCookie } from "@/lib/session"
import { verifyTelegramAuth } from "@/lib/telegram-auth"

/**
 * GET /api/auth/telegram/callback
 *
 * The Telegram Login Widget's data-auth-url target. Telegram redirects the
 * browser here with the signed user fields as query params. We verify the
 * HMAC against our bot token, upsert the user by telegramId, and set the
 * session cookie.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const params = Object.fromEntries(request.nextUrl.searchParams.entries())
  const botToken = process.env.TELEGRAM_BOT_TOKEN

  if (!botToken || !verifyTelegramAuth(params, botToken)) {
    return NextResponse.redirect(`${appUrl}/login?error=invalid_auth`)
  }

  const telegramId = Number(params.id)
  if (!Number.isFinite(telegramId)) {
    return NextResponse.redirect(`${appUrl}/login?error=invalid_auth`)
  }

  const [user] = await db
    .insert(users)
    .values({ telegramId, username: params.username ?? null })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: { username: params.username ?? null, updatedAt: new Date() },
    })
    .returning()

  const response = NextResponse.redirect(appUrl)
  await attachSessionCookie(response, user.id)
  return response
}
