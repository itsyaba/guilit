import type { Metadata } from "next"
import {
  IconBellRinging,
  IconCameraPlus,
  IconCircleCheck,
} from "@tabler/icons-react"

import { TelegramDeepLinkLogin } from "@/components/auth/telegram-deep-link-login"
import { TelegramLoginButton } from "@/components/auth/telegram-login-button"
import { Eyebrow, Shell, TextLink } from "@/components/kit"
import { safeRedirectPath } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Log in",
  description:
    "Log in with Telegram to claim listings and post directly on Gulit.",
  // An auth screen has nothing to index and a `next` parameter should never
  // become a crawlable URL.
  robots: { index: false, follow: false },
}

/**
 * What an account is actually for. Three, because there are three, and a
 * marketplace where browsing needs no login has to answer "why sign in" before
 * it asks for anything.
 */
const REASONS = [
  {
    icon: IconCircleCheck,
    title: "Claim a listing you posted",
    body: "Verify the phone number already in the post and the listing becomes yours to edit, mark sold, or remove.",
  },
  {
    icon: IconCameraPlus,
    title: "Post an item yourself",
    body: "Add photos and we read the title, category and condition off them. Two minutes, most of it waiting on the upload.",
  },
  {
    icon: IconBellRinging,
    title: "Save a search",
    body: "Get told when something matching it lands in one of the channels we index.",
  },
]

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams
  const botUsername = process.env.TELEGRAM_BOT_USERNAME
  const webhookReady = !!process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""

  /**
   * Where to land afterwards. /post sends people here with `?next=/post`, and
   * before this the callback dropped it and returned everyone to the home page
   * -- one tap of "Sell an item" turned into a login and then a hunt for the
   * form again.
   *
   * Telegram appends its signed fields to `data-auth-url`, so this rides along
   * as an extra query parameter. The callback strips it before verifying the
   * HMAC, because Telegram's data-check-string is every received field except
   * `hash` and an extra one of ours would break the digest.
   */
  const destination = safeRedirectPath(next)
  const callback = `${appUrl}/api/auth/telegram/callback${
    destination ? `?next=${encodeURIComponent(destination)}` : ""
  }`

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-24">
      <div className="grid items-start gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        {/* The argument. Left on desktop, above the card on a phone, because a
            login button with no reason attached is a dead end. */}
        <div className="anim-rise min-w-0">
          <Eyebrow>Account</Eyebrow>

          <h1 className="type-section type-display mt-4 max-w-[20ch] font-semibold text-foreground">
            Log in with Telegram
          </h1>

          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            One tap, no password. Browsing needs no account at all. Logging in
            is what lets you take over a listing or post one.
          </p>

          <ul className="mt-10 space-y-6">
            {REASONS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tray ring-1 ring-hairline"
                >
                  <Icon stroke={1.5} className="size-5 text-primary" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* The control. */}
        <div
          className="anim-rise lg:sticky lg:top-24"
          style={{ animationDelay: "90ms" }}
        >
          <Shell coreClassName="p-6 sm:p-8">
            {error ? (
              /* Inline, above the control that failed, and specific about what
                 to do next. The only reason to be here twice is a stale widget
                 payload, and retrying clears it. */
              <p
                role="alert"
                className="mb-6 rounded-tile bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive-strong"
              >
                That login could not be verified. Tap the button again; if it
                keeps failing, the bot domain is likely misconfigured.
              </p>
            ) : null}

            <p className="text-sm leading-relaxed text-foreground">
              {destination === "/post"
                ? "Log in and you will land straight on the posting form."
                : "Telegram signs you in. We never see your password."}
            </p>

            {/*
             * The deep link is the primary path and the widget is the fallback,
             * not the other way round. The widget's phone step depends on
             * Telegram delivering a service message to an active session; when
             * that does not happen it shows a spinner and no error, which is
             * indistinguishable from a bug in this app. The bot flow has no
             * such step -- the identity arrives over the Bot API, on a webhook
             * we authenticate ourselves.
             */}
            <div className="mt-6">
              {botUsername ? (
                <TelegramDeepLinkLogin next={destination} />
              ) : (
                <p className="type-ledger type-mixed rounded-tile bg-tray px-4 py-3 leading-relaxed text-muted-foreground ring-1 ring-hairline">
                  TELEGRAM_BOT_USERNAME is not set, so Telegram login cannot
                  start. Set it, set TELEGRAM_WEBHOOK_SECRET, and register the
                  bot webhook -- see SETUP.md 4.2.
                </p>
              )}
            </div>

            {botUsername && !webhookReady ? (
              /* Fails closed rather than silently: with no webhook secret the
                 bot route refuses every update, so a tap on Start would go
                 nowhere and the page would poll until the token expired. */
              <p
                role="alert"
                className="mt-6 rounded-tile bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive-strong"
              >
                TELEGRAM_WEBHOOK_SECRET is not set, so the bot cannot complete a
                login. Set it and run <code>npm run telegram:webhook</code>.
              </p>
            ) : null}

            {botUsername ? (
              /* Kept, and kept second. It still works for accounts that do get
                 the service message, and it is the only way in if the webhook
                 is ever misregistered. The slot is a fixed height because
                 Telegram swaps a script tag for an iframe a moment after paint,
                 and without reserved space the card jumps as it arrives. */
              <details className="group mt-8 border-t border-hairline pt-6">
                <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                  Use the old phone-number widget instead
                </summary>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Asks for your phone number, then waits on a confirmation
                  message inside Telegram. If that message never arrives, close
                  this and use the button above.
                </p>
                <div className="mt-4 flex min-h-16 items-center">
                  <TelegramLoginButton
                    botUsername={botUsername}
                    authUrl={callback}
                  />
                </div>
              </details>
            ) : null}

            <p className="mt-6 border-t border-hairline pt-6 text-xs leading-relaxed text-muted-foreground">
              We store your Telegram id and username, and nothing else. Gulit
              never posts to Telegram on your behalf and never messages your
              contacts.
            </p>
          </Shell>

          <p className="mt-6 text-center lg:text-left">
            <TextLink href="/browse">Keep browsing without an account</TextLink>
          </p>
        </div>
      </div>
    </div>
  )
}
