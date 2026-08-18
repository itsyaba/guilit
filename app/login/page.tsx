import type { Metadata } from "next"

import { TelegramLoginButton } from "@/components/auth/telegram-login-button"

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in with Telegram to claim listings and post directly on Gulit.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const botUsername = process.env.TELEGRAM_BOT_USERNAME
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""

  return (
    <div className="mx-auto max-w-sm px-4 py-16 text-center">
      <h1 className="type-display text-2xl font-semibold text-foreground">
        Log in with Telegram
      </h1>
      <p className="type-ledger mt-2 text-muted-foreground">
        One tap, no password. We use your Telegram identity to let you claim
        listings and post directly.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-destructive">
          That login could not be verified. Try again.
        </p>
      ) : null}

      <div className="mt-8 flex justify-center">
        {botUsername ? (
          <TelegramLoginButton
            botUsername={botUsername}
            authUrl={`${appUrl}/api/auth/telegram/callback`}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            TELEGRAM_BOT_USERNAME is not configured.
          </p>
        )}
      </div>
    </div>
  )
}
