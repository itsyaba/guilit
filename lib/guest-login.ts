import { db } from "@/db/client"
import { users } from "@/db/schema"
import type { User } from "@/db/types"

/**
 * Guest login — a way in that does not depend on Telegram.
 *
 * The real login is a bot deep link: tap, leave the browser, press Start,
 * come back. That is fine for a seller who already lives in Telegram and
 * hopeless for someone evaluating the app for ninety seconds on a laptop with
 * no Telegram account signed in. This mints a throwaway account instead, so
 * every logged-in surface — posting, claiming, messages, saved searches — can
 * be reached without the round trip.
 *
 * It is a real user row, not a pretend session: everything downstream reads
 * `users`, and a fake id in a cookie would fail the first foreign key.
 */

/**
 * On unless explicitly switched off, because the deployment that needs it most
 * is the demo one and an unset variable there would silently remove the only
 * working way in.
 */
export function isGuestLoginEnabled(): boolean {
  const flag = process.env.GUEST_LOGIN?.trim().toLowerCase()
  return flag !== "0" && flag !== "off" && flag !== "false"
}

const ADJECTIVES = [
  "swift",
  "calm",
  "bright",
  "keen",
  "brave",
  "quiet",
  "warm",
  "clever",
  "steady",
  "sunny",
  "bold",
  "kind",
]

const NOUNS = [
  "zebra",
  "cedar",
  "falcon",
  "harvest",
  "lantern",
  "meadow",
  "otter",
  "compass",
  "ibex",
  "juniper",
  "kestrel",
  "marble",
]

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

/**
 * `guest_` prefixed and readable, because it shows up in the navbar and on any
 * listing the account posts. It is also the marker that identifies these rows
 * for cleanup after a demo.
 */
function generateUsername(): string {
  const suffix = String(Math.floor(Math.random() * 9000) + 1000)
  return `guest_${pick(ADJECTIVES)}_${pick(NOUNS)}_${suffix}`
}

/**
 * Telegram ids are positive, so a negative one can never collide with an
 * account that later logs in for real — and `users.telegram_id` is unique, so
 * the column needs a value that is both unique and unmistakably not Telegram's.
 */
function generateTelegramId(): number {
  // Stays well inside Number.MAX_SAFE_INTEGER: ~1e9 of millisecond clock times
  // a 1e3 random tail is ~1e12.
  const clock = Date.now() % 1_000_000_000
  return -(clock * 1000 + Math.floor(Math.random() * 1000))
}

/**
 * Creates a fresh guest account. Each caller gets their own, so two judges on
 * the same deployment do not end up sharing an inbox.
 *
 * Retries on the unique constraint rather than pre-checking: the id is derived
 * from the clock, so a collision needs two calls in the same millisecond that
 * also drew the same random tail, and the database is the only thing that can
 * answer the question without a race anyway.
 */
export async function createGuestUser(): Promise<User> {
  let lastError: unknown

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [user] = await db
        .insert(users)
        .values({
          telegramId: generateTelegramId(),
          username: generateUsername(),
        })
        .returning()
      return user
    } catch (error) {
      lastError = error
    }
  }

  throw new Error("Could not create a guest account", { cause: lastError })
}
