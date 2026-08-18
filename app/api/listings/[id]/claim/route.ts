import type { NextRequest } from "next/server"
import { and, desc, eq, isNotNull } from "drizzle-orm"

import { db } from "@/db/client"
import { extractions, listingSources, listings, otpCodes, rawMessages } from "@/db/schema"
import { generateOtpCode, hashOtpCode, sendOtp } from "@/lib/otp"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import { isUuid } from "@/lib/utils"

/**
 * POST /api/listings/[id]/claim
 *
 * Initiates the OTP claim flow for an indexed listing. The code goes only to
 * the phone number already extracted from the listing's source messages —
 * never a user-supplied one, or the whole mechanism is worthless.
 *
 * params is a Promise in Next.js 16 — must be awaited before use.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isUuid(id)) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }

  try {
    await requireSessionUser()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Log in with Telegram to claim a listing." },
        { status: 401 }
      )
    }
    throw error
  }

  const [listing] = await db.select().from(listings).where(eq(listings.id, id)).limit(1)
  if (!listing) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }
  if (listing.tier !== "indexed") {
    return Response.json(
      { error: "This listing has already been claimed." },
      { status: 400 }
    )
  }

  // The phone "already in the listing" — highest-confidence extraction among
  // every source message clustered into this listing that has one.
  const [source] = await db
    .select({ phone: extractions.phoneNormalized })
    .from(listingSources)
    .innerJoin(rawMessages, eq(listingSources.rawMessageId, rawMessages.id))
    .innerJoin(extractions, eq(extractions.rawMessageId, rawMessages.id))
    .where(
      and(eq(listingSources.listingId, id), isNotNull(extractions.phoneNormalized))
    )
    .orderBy(desc(extractions.confidenceScore))
    .limit(1)

  const phone = source?.phone
  if (!phone) {
    return Response.json(
      { error: "No phone number on file for this listing." },
      { status: 400 }
    )
  }

  const ip = getClientIp(request)
  const [phoneOk, ipOk] = await Promise.all([
    checkRateLimit(`otp:phone:${phone}`, 3, 60 * 60),
    checkRateLimit(`otp:ip:${ip}`, 10, 60 * 60),
  ])
  if (!phoneOk || !ipOk) {
    return Response.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    )
  }

  const code = generateOtpCode()
  await db.insert(otpCodes).values({
    listingId: id,
    phone,
    codeHash: hashOtpCode(code),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  })
  sendOtp(phone, code)

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
