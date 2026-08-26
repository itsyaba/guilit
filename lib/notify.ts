/**
 * Best-effort outbound Telegram ping.
 *
 * A message sitting in an inbox nobody opens is not communication, and our
 * users are already in Telegram all day — that is the entire premise of the
 * product. So a new in-app message also pokes the recipient there, with a deep
 * link back into the thread.
 *
 * Best-effort is not laziness, it is the Bot API's actual constraint: a bot can
 * only message a user who has started a chat with it. Plenty of accounts logged
 * in through the widget never have. A failure here must therefore never fail
 * the write it is announcing — the message is already in Postgres, and the
 * recipient will see it on their next visit either way.
 *
 * Never awaited on the request path. See the call sites: `void notifyUser(...)`.
 */

const TIMEOUT_MS = 4000

export async function notifyTelegram(
  telegramId: number | null,
  text: string
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token || !telegramId) return false

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramId,
          text,
          parse_mode: "HTML",
          // The link is the point of the notification; a preview card of our own
          // listing page underneath it is noise in a chat list.
          link_preview_options: { is_disabled: true },
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    )
    if (!response.ok) {
      // 403 here is the normal case — the user never started the bot. Logged at
      // this level rather than swallowed silently so a *broken token* is still
      // findable in the container logs.
      console.warn(
        `[notify] telegram sendMessage ${response.status} for chat ${telegramId}`
      )
      return false
    }
    return true
  } catch (error) {
    console.warn(
      `[notify] telegram sendMessage failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** HTML-escapes user-written text before it goes into a parse_mode message. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
