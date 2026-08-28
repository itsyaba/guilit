import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { createGuestUser, isGuestLoginEnabled } from "@/lib/guest-login"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { attachSessionCookie } from "@/lib/session"
import { safeRedirectPath } from "@/lib/utils"

/**
 * POST /api/auth/guest
 *
 * Signs the caller in as a throwaway account, no Telegram involved. See
 * lib/guest-login.ts for why this exists and how to switch it off.
 *
 * POST rather than GET because it writes a row and sets a session cookie, and
 * a GET that does either is one prefetch away from creating accounts nobody
 * asked for.
 */
export async function POST(request: NextRequest) {
  if (!isGuestLoginEnabled()) {
    return NextResponse.json(
      { error: "Guest login is disabled on this deployment." },
      { status: 404 }
    )
  }

  // Every call writes a users row, so this is the guard against a script
  // filling the table. Generous, because a judge clicking twice is normal.
  const ip = getClientIp(request)
  const allowed = await checkRateLimit(`login:guest:ip:${ip}`, 20, 10 * 60)
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many guest logins. Wait a few minutes and try again." },
      { status: 429 }
    )
  }

  let nextPath: string | null = null
  try {
    const body = (await request.json()) as { next?: unknown }
    if (typeof body?.next === "string") nextPath = safeRedirectPath(body.next)
  } catch {
    // No body is fine — a guest with no destination lands on the home page.
  }

  const user = await createGuestUser()

  const response = NextResponse.json({
    next: nextPath ?? "/",
    username: user.username,
  })
  await attachSessionCookie(response, user.id)
  return response
}
