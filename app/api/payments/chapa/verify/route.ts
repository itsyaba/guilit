import { NextResponse, type NextRequest } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/db/client"
import { reservations } from "@/db/schema"
import { appUrl, verifyCharge } from "@/lib/chapa"
import { settleReservation } from "@/lib/reservations"

/**
 * GET /api/payments/chapa/verify?tx_ref=...
 *
 * Where the buyer's browser lands after the Chapa checkout, and also the
 * `callback_url` Chapa calls server-side. One handler for both because the
 * settlement is idempotent, and because the alternative — trusting whichever
 * arrives first and ignoring the other — is how a hold ends up paid in Chapa's
 * dashboard and pending in ours.
 *
 * Nothing in the query string is believed. A `status=success` parameter on an
 * inbound redirect is a claim made by whoever typed the URL; the only thing
 * taken from it is the reference, and the verdict is fetched from Chapa's API
 * with our secret key.
 *
 * Always redirects rather than returning JSON: a person is watching this
 * happen, and they should end up on the item they just put money against.
 */
export async function GET(request: NextRequest) {
  const base = appUrl(request.nextUrl.origin)
  const txRef =
    request.nextUrl.searchParams.get("tx_ref") ??
    request.nextUrl.searchParams.get("trx_ref")

  if (!txRef) {
    return NextResponse.redirect(new URL("/browse", base))
  }

  const [row] = await db
    .select({
      listingId: reservations.listingId,
      returnPath: reservations.returnPath,
    })
    .from(reservations)
    .where(eq(reservations.txRef, txRef))
    .limit(1)

  // A reference we never issued. Nothing to settle and nothing to disclose.
  if (!row) {
    return NextResponse.redirect(new URL("/browse", base))
  }

  /**
   * Back where the buyer started. A hold opened inside a thread carries a
   * `return_path` and goes back to that thread; one from the listing page has
   * none and goes to the item.
   *
   * The stored value is constrained to a same-site path on write (see
   * safeReturnPath in lib/reservations) — this redirect arrives with the
   * credibility of a completed payment, which is precisely what a phishing flow
   * would want to borrow.
   */
  const destination = (outcome: string) => {
    const path = row.returnPath ?? `/listing/${row.listingId}`
    const url = new URL(path, base)
    url.searchParams.set("hold", outcome)
    return url
  }

  const verified = await verifyCharge(txRef)
  if (!verified.ok) {
    // Chapa unreachable. The row stays `pending` so the webhook, or this route
    // on a reload, can still settle it — the buyer is told to wait, not that it
    // failed, because we genuinely do not know yet.
    console.error(`[chapa] verify failed for ${txRef}: ${verified.error}`)
    return NextResponse.redirect(destination("unknown"))
  }

  const { changed, reservation } = await settleReservation(
    txRef,
    verified.verdict,
    verified.payload
  )

  const status = reservation?.status ?? "pending"
  const outcome =
    status === "paid" ? "paid" : status === "pending" ? "unknown" : "failed"

  if (changed) {
    console.log(`[chapa] ${txRef} settled as ${status}`)
  }

  return NextResponse.redirect(destination(outcome))
}
