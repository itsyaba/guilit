import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { db } from "@/db/client"
import { users } from "@/db/schema"
import { attachSessionCookie } from "@/lib/session"
import { verifyTelegramAuth } from "@/lib/telegram-auth"
import { safeRedirectPath } from "@/lib/utils"

/**
 * GET /api/auth/telegram/callback
 *
 * The Telegram Login Widget's data-auth-url target. Telegram redirects the
 * browser here with the signed user fields as query params. We verify the
 * HMAC against our bot token, upsert the user by telegramId, and set the
 * session cookie.
 *
 * `next` is ours, not Telegram's. The login page puts it on the auth URL so a
 * seller who arrived from /post lands back there instead of on the home page,
 * and it has to be pulled out of the params before verification: Telegram's
 * data-check-string is every received field except `hash`, so one extra
 * parameter of ours would change the digest and fail every login.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const { next, ...params } = Object.fromEntries(
    request.nextUrl.searchParams.entries()
  )
  const botToken = process.env.TELEGRAM_BOT_TOKEN

  // Validated here as well as on the login page: this handler is reachable
  // directly, and a redirect target read straight off the query string is an
  // open redirector.
  const destination = safeRedirectPath(next) ?? "/"

  // Carried through the failure path too, so retrying a login keeps the intent
  // the seller started with.
  const retry = `${appUrl}/login?error=invalid_auth${
    destination === "/" ? "" : `&next=${encodeURIComponent(destination)}`
  }`

  if (!botToken || !verifyTelegramAuth(params, botToken)) {
    return NextResponse.redirect(retry)
  }

  const telegramId = Number(params.id)
  if (!Number.isFinite(telegramId)) {
    return NextResponse.redirect(retry)
  }

  const [user] = await db
    .insert(users)
    .values({ telegramId, username: params.username ?? null })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: { username: params.username ?? null, updatedAt: new Date() },
    })
    .returning()

  const response = NextResponse.redirect(new URL(destination, appUrl))
  await attachSessionCookie(response, user.id)
  return response
}
