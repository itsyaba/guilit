import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { attachSessionCookie } from "@/lib/session"
import {
  LOGIN_COOKIE,
  buildDeepLink,
  collectLoginToken,
  decodeLoginCookie,
  getBotConfig,
} from "@/lib/telegram-login"

/**
 * GET /api/auth/telegram/poll
 *
 * The browser side of the deep-link login. Reads the nonce and verifier out of
 * the httpOnly cookie set by ../start, and returns one of:
 *
 *   pending  the tap has not landed yet — keep polling
 *   ready    session cookie is attached to this response; navigate to `next`
 *   expired  the token timed out or was already collected — start over
 *
 * Deliberately not rate limited. It writes nothing until the token is claimed,
 * and a limit here would break the one thing the flow depends on: a browser
 * asking repeatedly for several minutes.
 */
export async function GET(request: NextRequest) {
  const cookie = decodeLoginCookie(request.cookies.get(LOGIN_COOKIE)?.value)
  if (!cookie) {
    return NextResponse.json({ status: "expired" })
  }

  const result = await collectLoginToken(cookie.nonce, cookie.verifier)

  if (result.status === "pending") {
    // The deep link comes back with every pending answer so a reload does not
    // have to burn a fresh token: the cookie still points at a live one, and
    // the nonce is reconstructible into the same t.me URL.
    const bot = getBotConfig()
    return NextResponse.json({
      status: "pending",
      deepLink: bot ? buildDeepLink(bot.username, cookie.nonce) : null,
    })
  }

  if (result.status !== "ready") {
    // "unknown" — a nonce we have no row for, or a verifier that does not match
    // it — is reported as "expired" too. The distinction is only useful to
    // someone probing for valid nonces.
    const stale = NextResponse.json({ status: "expired" })
    stale.cookies.delete(LOGIN_COOKIE)
    return stale
  }

  const response = NextResponse.json({
    status: "ready",
    next: result.nextPath ?? "/",
  })
  await attachSessionCookie(response, result.userId)
  response.cookies.delete(LOGIN_COOKIE)
  return response
}
