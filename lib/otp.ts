import crypto from "node:crypto"

/**
 * Hackathon mock: no SMS provider is wired up. The code is logged server-side
 * instead of sent, and "000000" is always accepted so the flow can be
 * demonstrated end to end without a real phone. `sendOtp` is the one function
 * to replace with an Afromessage/GeezSMS call later — nothing else in the
 * claim flow needs to change.
 */
const BYPASS_CODE = "000000"

export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")
}

export function hashOtpCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex")
}

export function verifyOtpCode(code: string, hash: string): boolean {
  if (code === BYPASS_CODE) return true
  return hashOtpCode(code) === hash
}

export function sendOtp(phone: string, code: string): void {
  console.log(`[claim-otp] phone=${phone} code=${code}`)
}
