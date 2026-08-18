import type { NextRequest } from "next/server"
import { and, desc, eq, gt, isNull } from "drizzle-orm"

import { db } from "@/db/client"
import { listings, otpCodes, users } from "@/db/schema"
import { verifyOtpCode } from "@/lib/otp"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import { isUuid } from "@/lib/utils"

/**
 * POST /api/listings/[id]/claim/verify
 *
 * Body: { code: string }. On a correct code (or the hackathon "000000"
 * bypass — see lib/otp.ts), the listing flips to claimed and the phone is
 * attached to the signed-in user's account.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isUuid(id)) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }

  let user
  try {
    user = await requireSessionUser()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Log in with Telegram to claim a listing." },
        { status: 401 }
      )
    }
    throw error
  }

  const body = await request.json().catch(() => ({}))
  const code = typeof body.code === "string" ? body.code.trim() : ""
  if (!code) {
    return Response.json({ error: "Code is required." }, { status: 400 })
  }

  const [otp] = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.listingId, id),
        isNull(otpCodes.consumedAt),
        gt(otpCodes.expiresAt, new Date())
      )
    )
    .orderBy(desc(otpCodes.createdAt))
    .limit(1)

  if (!otp) {
    return Response.json(
      { error: "No active code for this listing. Request a new one." },
      { status: 400 }
    )
  }
  if (otp.attempts >= 5) {
    return Response.json(
      { error: "Too many attempts. Request a new code." },
      { status: 429 }
    )
  }

  if (!verifyOtpCode(code, otp.codeHash)) {
    await db
      .update(otpCodes)
      .set({ attempts: otp.attempts + 1 })
      .where(eq(otpCodes.id, otp.id))
    return Response.json({ error: "Incorrect code." }, { status: 401 })
  }

  const [updatedListing] = await db.transaction(async (tx) => {
    await tx
      .update(otpCodes)
      .set({ consumedAt: new Date() })
      .where(eq(otpCodes.id, otp.id))
    await tx
      .update(users)
      .set({ phone: otp.phone, phoneVerified: true, updatedAt: new Date() })
      .where(eq(users.id, user.id))
    return tx
      .update(listings)
      .set({ sellerId: user.id, tier: "claimed", updatedAt: new Date() })
      .where(eq(listings.id, id))
      .returning()
  })

  return Response.json({ listingId: id, status: "claimed", tier: updatedListing.tier })
}
