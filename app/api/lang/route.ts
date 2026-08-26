import type { NextRequest } from "next/server"

import { LANG_COOKIE, isLang } from "@/lib/i18n"

/**
 * POST /api/lang
 *
 * The language toggle is a real form posting here, not a click handler. That is
 * the whole reason this route exists: switching to Amharic has to work on a
 * phone that never finished downloading our JavaScript, which is the same phone
 * most likely to want Amharic in the first place.
 *
 * Answers 303 so the browser re-requests the referring page with GET. The
 * redirect target is taken from our own form field and validated as a relative
 * path -- never echoed from Referer, which is attacker-controlled and would
 * make this an open redirect.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const lang = form?.get("lang")
  const to = form?.get("to")

  if (!isLang(lang)) {
    return Response.json({ error: "lang must be 'en' or 'am'." }, { status: 400 })
  }

  // Same-origin, path-only. A value starting `//` or `https:` is a redirect off
  // our own site, so it does not get used.
  const raw = typeof to === "string" ? to : "/"
  const target = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/"

  const response = new Response(null, {
    status: 303,
    headers: { Location: target },
  })
  response.headers.append(
    "Set-Cookie",
    `${LANG_COOKIE}=${lang}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`
  )
  return response
}
