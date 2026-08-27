import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import {
  LOGIN_COOKIE,
  buildDeepLink,
  createLoginToken,
  encodeLoginCookie,
  getBotConfig,
} from "@/lib/telegram-login"
import { safeRedirectPath } from "@/lib/utils"

/**
 * POST /api/auth/telegram/start
 *
 * Opens a bot deep-link login. Mints a nonce for the t.me URL and a verifier
 * that stays in this browser, then hands back the link for the user to tap.
 *
 * The verifier rides in an httpOnly cookie rather than the JSON body: the page
 * never needs to read it, and anything the page can read is something an
 * injected script can read too.
 */
export async function POST(request: NextRequest) {
  const bot = getBotConfig()
  if (!bot) {
    return NextResponse.json(
      { error: "Telegram login is not configured on this deployment." },
      { status: 503 }
    )
  }

  // Each attempt writes a row and the login page opens one on load, so this is
  // the guard against a refresh loop — or a script — filling the table.
  const ip = getClientIp(request)
  const allowed = await checkRateLimit(`login:start:ip:${ip}`, 20, 10 * 60)
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Wait a few minutes and try again." },
      { status: 429 }
    )
  }

  let nextPath: string | null = null
  try {
    const body = (await request.json()) as { next?: unknown }
    if (typeof body?.next === "string") nextPath = safeRedirectPath(body.next)
  } catch {
    // No body is the normal case for a login with no destination in mind.
  }

  const { nonce, verifier, expiresAt } = await createLoginToken(nextPath)

  const response = NextResponse.json({
    deepLink: buildDeepLink(bot.username, nonce),
    botUsername: bot.username,
    expiresAt: expiresAt.toISOString(),
  })

  response.cookies.set(LOGIN_COOKIE, encodeLoginCookie(nonce, verifier), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Outlives the token itself by a minute so an expiry is reported as
    // "expired" by the poll route rather than as a missing cookie.
    maxAge: 11 * 60,
  })

  return response
}
