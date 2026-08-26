import type { NextRequest } from "next/server"

import { verifyCharge, verifyWebhookSignature } from "@/lib/chapa"
import { settleReservation } from "@/lib/reservations"

/**
 * POST /api/payments/chapa/webhook
 *
 * Chapa's server-to-server notification. Two things matter here.
 *
 * First, the signature. The raw body is read as text and checked before it is
 * parsed, because the HMAC covers the exact bytes sent — re-serialising parsed
 * JSON and hashing that would fail on nothing more than key order. An
 * unsigned or wrongly signed request is refused with 401; with no
 * CHAPA_WEBHOOK_SECRET configured that is every request, which is deliberate.
 * The browser return in ../verify still settles the hold, so a deployment
 * without a webhook secret is degraded, not broken.
 *
 * Second, the payload is a trigger, not a source of truth. Even correctly
 * signed, all this handler takes from it is the reference; the verdict comes
 * from asking Chapa's API directly. A signature proves who sent the message,
 * not that its contents match the ledger.
 *
 * Returns 200 for anything we have decided about, including a reference we do
 * not recognise — a non-2xx makes Chapa retry, and retrying will not make an
 * unknown reference known.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text()

  if (!verifyWebhookSignature(raw, request.headers)) {
    console.warn("[chapa] webhook rejected: bad or missing signature")
    return Response.json({ error: "Invalid signature." }, { status: 401 })
  }

  let payload: Record<string, unknown> = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    return Response.json({ error: "Malformed payload." }, { status: 400 })
  }

  const nested = payload.data as Record<string, unknown> | undefined
  const txRef =
    (typeof payload.tx_ref === "string" ? payload.tx_ref : null) ??
    (typeof nested?.tx_ref === "string" ? nested.tx_ref : null) ??
    (typeof payload.trx_ref === "string" ? payload.trx_ref : null)

  if (!txRef) {
    return Response.json({ status: "ignored", reason: "no reference" })
  }

  const verified = await verifyCharge(txRef)
  if (!verified.ok) {
    // Chapa will retry; a 502 tells them to.
    console.error(`[chapa] webhook verify failed for ${txRef}: ${verified.error}`)
    return Response.json({ error: "Verification failed." }, { status: 502 })
  }

  const { changed, reservation } = await settleReservation(
    txRef,
    verified.verdict,
    verified.payload
  )

  if (changed) {
    console.log(`[chapa] webhook settled ${txRef} as ${reservation?.status}`)
  }

  return Response.json({
    status: reservation ? (changed ? "settled" : "already_settled") : "unknown_ref",
  })
}
