"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Stage = "idle" | "sent" | "done"

/**
 * The functional half of "Is this listing yours?" — sends an OTP to the
 * phone already extracted from the listing (never a user-supplied one) and
 * verifies it. Hackathon note: the code is only logged server-side right
 * now (see lib/otp.ts) — "000000" always works while a real SMS provider
 * isn't wired up.
 */
export function ClaimPanel({
  listingId,
  isLoggedIn,
}: {
  listingId: string
  isLoggedIn: boolean
}) {
  const router = useRouter()
  const [stage, setStage] = React.useState<Stage>("idle")
  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function sendCode() {
    setPending(true)
    setError(null)
    const res = await fetch(`/api/listings/${listingId}/claim`, { method: "POST" })
    setPending(false)
    if (res.ok) {
      setStage("sent")
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Could not send a code. Try again shortly.")
    }
  }

  async function verify() {
    setPending(true)
    setError(null)
    const res = await fetch(`/api/listings/${listingId}/claim/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
    setPending(false)
    if (res.ok) {
      setStage("done")
      router.refresh()
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Incorrect code.")
    }
  }

  if (!isLoggedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        <a href="/login" className="text-primary underline underline-offset-4">
          Log in with Telegram
        </a>{" "}
        to claim this listing.
      </p>
    )
  }

  if (stage === "done") {
    return (
      <p className="text-sm text-foreground">
        Claimed — this listing is now linked to your account.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {stage === "idle" ? (
        <Button type="button" size="sm" variant="outline" onClick={sendCode} disabled={pending}>
          {pending ? "Sending…" : "Send verification code"}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="6-digit code"
            inputMode="numeric"
            maxLength={6}
            className="h-9 w-28"
          />
          <Button type="button" size="sm" onClick={verify} disabled={pending || !code}>
            {pending ? "Verifying…" : "Verify"}
          </Button>
        </div>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
