import crypto from "node:crypto"

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60

/**
 * Verifies the Telegram Login Widget payload per Telegram's spec:
 * https://core.telegram.org/widgets/login#checking-authorization
 *
 * The data-check-string is every field except `hash`, sorted by key, joined
 * as `key=value\n`. It's HMAC-SHA256'd with sha256(bot_token) as the key and
 * compared to the `hash` field. A tampered field or bot token mismatch
 * changes the digest completely, and auth_date guards against replaying an
 * old payload.
 */
export function verifyTelegramAuth(
  payload: Record<string, string>,
  botToken: string
): boolean {
  const { hash, ...fields } = payload
  if (!hash) return false

  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n")

  const secretKey = crypto.createHash("sha256").update(botToken).digest()
  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex")

  const computed = Buffer.from(computedHash)
  const given = Buffer.from(hash)
  if (computed.length !== given.length) return false
  if (!crypto.timingSafeEqual(computed, given)) return false

  const authDate = Number(fields.auth_date)
  if (!Number.isFinite(authDate)) return false
  const ageSeconds = Date.now() / 1000 - authDate
  return ageSeconds >= 0 && ageSeconds <= MAX_AUTH_AGE_SECONDS
}
