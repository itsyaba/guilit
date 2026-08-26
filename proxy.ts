import { NextResponse, type NextRequest } from "next/server"

import { LANG_COOKIE, isLang } from "@/lib/i18n"

const YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * Resolve the interface language once, on the first request of a session, and
 * publish the current path for the language toggle to return to.
 *
 * Next 16 renamed this convention from `middleware` to `proxy`; the API is
 * identical.
 *
 * A visitor whose browser asks for Amharic gets an Amharic page on first paint
 * -- not an English one that swaps after hydration. That only works if the
 * language is known before the server component renders, which means here.
 *
 * On that first request the cookie is written onto the forwarded *request*
 * headers as well as the response. Without it the layout's `cookies()` read on
 * this same pass would still see nothing, and the very first page view would
 * render English before persisting Amharic for the second.
 *
 * Once the cookie exists this only forwards the path header: an explicit choice
 * from the toggle outranks the browser's Accept-Language on every request after
 * the first.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers)

  // Where the toggle should send the reader back to. Referer is
  // attacker-controlled; this is ours, and the route handler re-validates it.
  headers.set("x-gulit-path", request.nextUrl.pathname + request.nextUrl.search)

  if (isLang(request.cookies.get(LANG_COOKIE)?.value)) {
    return NextResponse.next({ request: { headers } })
  }

  // `am` only when Amharic is the *primary* preference. A trailing `am;q=0.3`
  // behind English is a reader who would rather have English.
  const primary = (request.headers.get("accept-language") ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase()
  const lang = primary === "am" || primary.startsWith("am-") ? "am" : "en"

  const cookie = request.headers.get("cookie")
  headers.set(
    "cookie",
    cookie ? `${cookie}; ${LANG_COOKIE}=${lang}` : `${LANG_COOKIE}=${lang}`
  )

  const response = NextResponse.next({ request: { headers } })
  response.cookies.set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: YEAR_SECONDS,
    sameSite: "lax",
  })
  return response
}

export const config = {
  // Pages only. Static assets, the image optimiser and API routes have no
  // interface language to resolve, and paying for this on every photo request
  // would be silly.
  matcher: ["/((?!_next/static|_next/image|api/|img/|favicon.ico).*)"],
}
