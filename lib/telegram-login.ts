import crypto from "node:crypto"
import { and, eq, isNull, lt } from "drizzle-orm"

import { db } from "@/db/client"
import { loginTokens, users } from "@/db/schema"

/**
 * Bot deep-link login.
 *
 * The Telegram Login Widget routes authentication through oauth.telegram.org: the
 * user types a phone number and waits for a service message from Telegram. When
 * that message does not arrive — no active session on an official client, a
 * number that does not match the account, a browser that blocks the popup's
 * storage — the widget spins forever and reports nothing, because Telegram will
 * not disclose whether a number is registered.
 *
 * This flow removes every one of those moving parts. The browser mints a nonce,
 * the user taps `t.me/<bot>?start=<nonce>`, and the bot's own webhook tells us
 * who tapped. No phone number is typed, no service message has to be delivered,
 * and the identity comes from the Bot API over a channel we authenticate with
 * the bot token — the same trust root `verifyTelegramAuth` uses, just reached
 * from the other direction.
 *
 * It also fixes a second thing for free: `notifyTelegram` can only message a
 * user who has started a chat with the bot, which under the widget was almost
 * nobody. Logging in this way *is* starting that chat.
 */

const TOKEN_TTL_SECONDS = 10 * 60

/** Telegram allows 1–64 chars of [A-Za-z0-9_-] in a start payload. */
const NONCE_BYTES = 24
const VERIFIER_BYTES = 32

export const LOGIN_COOKIE = "gl_login"

export type BotConfig = { token: string; username: string }

/**
 * Both halves or nothing. The username builds the deep link the browser opens;
 * the token authenticates the webhook's replies. A deployment with only one of
 * them can render a link that goes nowhere useful, so the login page treats a
 * partial config as no config.
 */
export function getBotConfig(): BotConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "")
  if (!token || !username) return null
  return { token, username }
}

function randomUrlSafe(bytes: number): string {
  return crypto.randomBytes(bytes).toString("base64url")
}

function hashVerifier(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("hex")
}

/**
 * The cookie carries `nonce.verifier` so the poll route needs no query string —
 * a nonce in a URL ends up in referrers and server logs, and the whole point of
 * the verifier is that it never leaves this browser.
 */
export function encodeLoginCookie(nonce: string, verifier: string): string {
  return `${nonce}.${verifier}`
}

export function decodeLoginCookie(
  value: string | undefined
): { nonce: string; verifier: string } | null {
  if (!value) return null
  const separator = value.indexOf(".")
  if (separator <= 0) return null
  const nonce = value.slice(0, separator)
  const verifier = value.slice(separator + 1)
  if (!nonce || !verifier) return null
  return { nonce, verifier }
}

export function buildDeepLink(botUsername: string, nonce: string): string {
  return `https://t.me/${botUsername}?start=${nonce}`
}

export type CreatedLoginToken = {
  nonce: string
  verifier: string
  expiresAt: Date
}

export async function createLoginToken(
  nextPath: string | null
): Promise<CreatedLoginToken> {
  const nonce = randomUrlSafe(NONCE_BYTES)
  const verifier = randomUrlSafe(VERIFIER_BYTES)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000)

  await db.insert(loginTokens).values({
    nonce,
    verifierHash: hashVerifier(verifier),
    nextPath,
    expiresAt,
  })

  // Opportunistic, unawaited, and failure-tolerant: a login attempt should not
  // pay for housekeeping, and a full table of dead nonces is a slow disk-space
  // problem rather than a correctness one.
  void db
    .delete(loginTokens)
    .where(
      lt(loginTokens.expiresAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
    )
    .catch(() => {})

  return { nonce, verifier, expiresAt }
}

export type ApprovalResult =
  | { ok: true; username: string | null }
  | { ok: false; reason: "unknown" | "expired" | "used" }

/**
 * Called by the bot webhook when a `/start <nonce>` lands.
 *
 * The user row is upserted here rather than at collection time so that the
 * moment the tap happens, the account exists — the poll route then only has to
 * hand out a cookie, and a browser that never comes back has still produced a
 * user who can be messaged by the bot.
 */
export async function approveLoginToken(
  nonce: string,
  telegramId: number,
  username: string | null
): Promise<ApprovalResult> {
  const [token] = await db
    .select()
    .from(loginTokens)
    .where(eq(loginTokens.nonce, nonce))
    .limit(1)

  if (!token) return { ok: false, reason: "unknown" }
  if (token.consumedAt) return { ok: false, reason: "used" }
  if (token.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" }
  }

  const [user] = await db
    .insert(users)
    .values({ telegramId, username })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: { username, updatedAt: new Date() },
    })
    .returning()

  // Re-checking `approved_at IS NULL` keeps a double-tap on the Start button
  // from rebinding a token that is already spoken for.
  await db
    .update(loginTokens)
    .set({ telegramId, userId: user.id, approvedAt: new Date() })
    .where(and(eq(loginTokens.id, token.id), isNull(loginTokens.approvedAt)))

  return { ok: true, username: user.username }
}

export type CollectResult =
  | { status: "ready"; userId: string; nextPath: string | null }
  | { status: "pending" }
  | { status: "expired" }
  | { status: "unknown" }

/**
 * Called by the browser's poll. Requires the verifier, so seeing the deep link
 * is not enough to collect the session it opens.
 */
export async function collectLoginToken(
  nonce: string,
  verifier: string
): Promise<CollectResult> {
  const [token] = await db
    .select()
    .from(loginTokens)
    .where(eq(loginTokens.nonce, nonce))
    .limit(1)

  if (!token) return { status: "unknown" }

  const expected = Buffer.from(token.verifierHash)
  const given = Buffer.from(hashVerifier(verifier))
  if (expected.length !== given.length) return { status: "unknown" }
  if (!crypto.timingSafeEqual(expected, given)) return { status: "unknown" }

  if (token.consumedAt) return { status: "expired" }
  if (token.expiresAt.getTime() <= Date.now()) return { status: "expired" }
  if (!token.approvedAt || !token.userId) return { status: "pending" }

  // The single-use gate. Two tabs polling the same cookie both reach here; the
  // WHERE clause means exactly one of them gets a row back.
  const [claimed] = await db
    .update(loginTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(loginTokens.id, token.id), isNull(loginTokens.consumedAt)))
    .returning({ userId: loginTokens.userId, nextPath: loginTokens.nextPath })

  if (!claimed?.userId) return { status: "expired" }

  return {
    status: "ready",
    userId: claimed.userId,
    nextPath: claimed.nextPath,
  }
}
