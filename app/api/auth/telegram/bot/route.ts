import type { NextRequest } from "next/server"

import { escapeHtml, notifyTelegram } from "@/lib/notify"
import { approveLoginToken } from "@/lib/telegram-login"

/**
 * POST /api/auth/telegram/bot
 *
 * The bot's webhook. Register it once with scripts/set-telegram-webhook.mjs;
 * see SETUP.md § 4.2.
 *
 * Telegram delivers every update for the bot here, but the only one that means
 * anything to us is `/start <nonce>` in a private chat: that is a person who
 * tapped a deep link this server minted, and `message.from.id` is their real
 * Telegram id as asserted by Telegram over a channel authenticated with our
 * secret token. Nothing in the body is trusted before that header is checked.
 *
 * Always answers 200, including for updates it ignores and nonces it does not
 * recognise. A non-2xx makes Telegram redeliver, and redelivering will not make
 * an unknown nonce known — it will just retry the same no-op until the queue
 * backs up behind it.
 */

/**
 * `/start`, optionally addressed to the bot by name (which is what Telegram
 * sends when the command comes from a group), optionally carrying a payload.
 * Anchored at both ends: a start payload cannot contain whitespace, so anything
 * that does is not one of ours.
 */
const START_COMMAND = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/

/**
 * What createLoginToken actually mints: 24 random bytes, base64url. Checking
 * the shape before the lookup keeps a stray `/start please help` — or a 4KB
 * message — from reaching the database at all.
 */
const NONCE_SHAPE = /^[A-Za-z0-9_-]{16,64}$/

type TelegramUpdate = {
  message?: {
    text?: string
    chat?: { id?: number; type?: string }
    from?: { id?: number; username?: string; language_code?: string }
  }
}

function isAmharic(languageCode: string | undefined): boolean {
  return (languageCode ?? "").toLowerCase().startsWith("am")
}

export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()

  if (!secret) {
    // Without a secret there is no way to tell Telegram apart from anyone who
    // found this URL, and this endpoint mints logins. Refusing everything is
    // the correct degraded state; the login page says so out loud.
    console.error(
      "[telegram-bot] TELEGRAM_WEBHOOK_SECRET is not set — webhook disabled"
    )
    return Response.json({ ok: true, ignored: "not_configured" })
  }

  const presented = request.headers.get("x-telegram-bot-api-secret-token")
  if (presented !== secret) {
    console.warn("[telegram-bot] update rejected: bad or missing secret token")
    return Response.json({ error: "Forbidden." }, { status: 403 })
  }

  let update: TelegramUpdate = {}
  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return Response.json({ error: "Malformed update." }, { status: 400 })
  }

  const message = update.message
  const from = message?.from
  // Groups can also run /start on a bot. A login is a person, not a room.
  if (!message?.text || !from?.id || message.chat?.type !== "private") {
    return Response.json({ ok: true, ignored: "not_a_private_command" })
  }

  const match = START_COMMAND.exec(message.text.trim())
  if (!match) {
    return Response.json({ ok: true, ignored: "not_start" })
  }

  const amharic = isAmharic(from.language_code)
  const nonce = match[1]

  // Bare /start: someone opened the bot directly rather than through a link.
  if (!nonce) {
    void notifyTelegram(
      from.id,
      amharic
        ? "ሰላም! ወደ ጉሊት ለመግባት በድረ-ገጹ ላይ <b>በTelegram ግባ</b> የሚለውን ተጫን።"
        : "Hi! To sign in, tap <b>Continue with Telegram</b> on the Gulit site and this chat will do the rest."
    )
    return Response.json({ ok: true, ignored: "bare_start" })
  }

  if (!NONCE_SHAPE.test(nonce)) {
    return Response.json({ ok: true, ignored: "malformed_nonce" })
  }

  const result = await approveLoginToken(nonce, from.id, from.username ?? null)

  if (!result.ok) {
    void notifyTelegram(
      from.id,
      amharic
        ? "ይህ የመግቢያ አገናኝ ጊዜው አልፎበታል። እባክዎ በድረ-ገጹ ላይ እንደገና ይሞክሩ።"
        : "That sign-in link has expired or was already used. Head back to the site and start again."
    )
    return Response.json({ ok: true, login: result.reason })
  }

  const who = result.username ? ` @${escapeHtml(result.username)}` : ""
  void notifyTelegram(
    from.id,
    amharic
      ? `ገብተዋል${who}። ወደ አሳሹ ትር ይመለሱ።`
      : `Signed in${who}. Head back to your browser tab — it is already unlocking.`
  )

  // Bot logged, not user-facing: this is the line that tells you whether a
  // failed login died at the tap or at the poll.
  console.log(`[telegram-bot] login approved for telegram_id=${from.id}`)

  return Response.json({ ok: true, login: "approved" })
}
