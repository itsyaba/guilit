import type { NextRequest } from "next/server"

/**
 * POST /api/listings/[id]/claim
 *
 * Initiates the OTP claim flow for an indexed listing.
 * The seller proves ownership by receiving an OTP on the phone number
 * already extracted from the listing. Real implementation will:
 *   1. Look up the listing's extracted phone number
 *   2. Send an OTP via Telegram bot
 *   3. Return a claim_token to verify in a follow-up request
 *
 * params is a Promise in Next.js 16 — must be awaited before use.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return Response.json(
    {
      listingId: id,
      status: "otp_sent",
      message:
        "An OTP has been sent to the phone number associated with this listing.",
      expiresInSeconds: 300,
    },
    { status: 202 }
  )
}
