import crypto from "node:crypto"

/**
 * Chapa — the payment leg of a reservation hold.
 *
 * Hand-rolled fetch rather than an SDK, for the same reason lib/vision.ts is:
 * three endpoints, no streaming, and a dependency that wraps `fetch` is a
 * dependency that also decides our timeout and error semantics for us. Here
 * those are the parts that matter, because this module is the only one in the
 * app that moves money.
 *
 * Contract: nothing here throws. Every failure — network, timeout, non-2xx,
 * malformed JSON, missing key — comes back as `{ ok: false, error }` with a
 * sentence a buyer can read, because the caller is a route handler whose job is
 * to say "we could not open the checkout" rather than to crash.
 *
 * Mock mode mirrors the GEMINI_API_KEY convention: with CHAPA_SECRET_KEY blank
 * or set to "mock", the checkout URL points back at our own verify route and
 * the hold completes end to end with no Chapa account. That is what lets `make
 * dev`, CI, and a demo on a hotel network all exercise the same code path.
 */

const DEFAULT_BASE_URL = "https://api.chapa.co/v1"

/** Chapa is a card network away; 8s is generous and still bounded. */
const TIMEOUT_MS = Number(process.env.CHAPA_TIMEOUT_MS ?? 8000)

/**
 * Chapa truncates the checkout title hard — anything past 16 characters is
 * rejected outright rather than trimmed, which is a 400 on a live checkout.
 */
const MAX_TITLE_CHARS = 16

export function chapaBaseUrl(): string {
  return (process.env.CHAPA_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "")
}

/**
 * No separate flag: the key's own value decides, so there is no way to be in
 * mock mode while believing real money is moving, or the reverse.
 */
export function isChapaMockMode(): boolean {
  const key = process.env.CHAPA_SECRET_KEY?.trim()
  return !key || key === "mock"
}

export function appUrl(fallbackOrigin?: string): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    fallbackOrigin?.replace(/\/$/, "") ??
    "http://localhost:3000"
  )
}

// --------------------------------------------------------------------------
// Deposit sizing
// --------------------------------------------------------------------------

/** Percent of the asking price taken as a deposit. */
const DEPOSIT_PCT = 5
const DEPOSIT_MIN_ETB = 50
const DEPOSIT_MAX_ETB = 1000

/**
 * The deposit for an item at this price.
 *
 * A percentage alone is wrong at both ends of our catalogue: 5% of a 300 ETB
 * kettle is not worth a card fee, and 5% of a 900,000 ETB car is more than
 * anyone will hand to a stranger's marketplace to hold a viewing. So it is a
 * percentage with a floor and a ceiling, rounded to something a person would
 * say out loud.
 *
 * Returns null when the listing has no price — a hold on an unpriced item has
 * nothing to be a percentage of, and guessing would be inventing the seller's
 * price for them.
 */
export function depositForPrice(priceEtb: number | null): number | null {
  if (priceEtb === null || !Number.isFinite(priceEtb) || priceEtb <= 0) {
    return null
  }
  const raw = (priceEtb * DEPOSIT_PCT) / 100
  const clamped = Math.min(Math.max(raw, DEPOSIT_MIN_ETB), DEPOSIT_MAX_ETB)
  // To the nearest 10 ETB, and never above the item's own price.
  return Math.min(Math.round(clamped / 10) * 10, priceEtb)
}

/** Hours a paid hold stands before it lapses. */
export function holdHours(): number {
  const raw = Number(process.env.RESERVATION_HOLD_HOURS ?? 24)
  return Number.isFinite(raw) && raw > 0 ? raw : 24
}

// --------------------------------------------------------------------------
// Transaction reference
// --------------------------------------------------------------------------

/**
 * Our idempotency key, and the only thing tying a Chapa callback back to a row.
 * Prefixed so it is recognisable in Chapa's dashboard next to other merchants'
 * traffic, and random rather than sequential so it cannot be enumerated by
 * someone probing the verify route.
 */
export function generateTxRef(): string {
  return `gulit-${crypto.randomBytes(9).toString("base64url")}`
}

// --------------------------------------------------------------------------
// Initialize
// --------------------------------------------------------------------------

export type ChapaInitInput = {
  txRef: string
  amountEtb: number
  /** Chapa requires an email field; a placeholder is fine and never mailed. */
  email: string
  firstName: string
  lastName: string
  phone: string | null
  /** Shown on Chapa's checkout page. Truncated to 16 chars — see above. */
  title: string
  description: string
  /** Browser lands here after the checkout. */
  returnUrl: string
  /** Chapa calls this server-side when the charge settles. */
  callbackUrl: string
}

export type ChapaResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; detail?: string }

/**
 * Opens a hosted checkout and returns the URL to send the buyer to.
 *
 * In mock mode the URL is our own verify route, which is what makes the whole
 * reservation flow demonstrable without a merchant account.
 */
export async function initializeCharge(
  input: ChapaInitInput
): Promise<ChapaResult<{ checkoutUrl: string; mocked: boolean }>> {
  if (isChapaMockMode()) {
    const url = new URL(input.returnUrl)
    url.searchParams.set("mock", "1")
    return { ok: true, checkoutUrl: url.toString(), mocked: true }
  }

  const body = {
    amount: String(input.amountEtb),
    currency: "ETB",
    email: input.email,
    first_name: input.firstName,
    last_name: input.lastName,
    ...(input.phone ? { phone_number: input.phone } : {}),
    tx_ref: input.txRef,
    callback_url: input.callbackUrl,
    return_url: input.returnUrl,
    customization: {
      title: input.title.slice(0, MAX_TITLE_CHARS),
      description: input.description.slice(0, 200),
    },
  }

  const response = await postJson(`${chapaBaseUrl()}/transaction/initialize`, body)
  if (!response.ok) return response

  const checkoutUrl = (response.data as ChapaEnvelope)?.data?.checkout_url
  if (typeof checkoutUrl !== "string" || !checkoutUrl) {
    return {
      ok: false,
      error: "Chapa did not return a checkout page. Nothing was charged.",
      detail: JSON.stringify(response.data).slice(0, 400),
    }
  }

  return { ok: true, checkoutUrl, mocked: false }
}

// --------------------------------------------------------------------------
// Verify
// --------------------------------------------------------------------------

export type ChapaVerdict = "success" | "pending" | "failed"

/**
 * Asks Chapa what actually happened to a reference.
 *
 * This is the authority, not the webhook and certainly not the query string the
 * browser came back with. Both of those are inputs that tell us *when* to ask;
 * this is the answer we write to the database.
 */
export async function verifyCharge(
  txRef: string
): Promise<
  ChapaResult<{
    verdict: ChapaVerdict
    providerRef: string | null
    amountEtb: number | null
    payload: unknown
  }>
> {
  if (isChapaMockMode()) {
    return {
      ok: true,
      verdict: "success",
      providerRef: `mock-${txRef}`,
      amountEtb: null,
      payload: { mocked: true, tx_ref: txRef },
    }
  }

  const response = await getJson(
    `${chapaBaseUrl()}/transaction/verify/${encodeURIComponent(txRef)}`
  )
  if (!response.ok) return response

  const envelope = response.data as ChapaEnvelope
  const inner = envelope?.data ?? null
  const rawStatus = String(inner?.status ?? envelope?.status ?? "").toLowerCase()

  const verdict: ChapaVerdict =
    rawStatus === "success"
      ? "success"
      : rawStatus === "pending" || rawStatus === "processing"
        ? "pending"
        : "failed"

  const amount = Number(inner?.amount)

  return {
    ok: true,
    verdict,
    providerRef:
      typeof inner?.reference === "string"
        ? inner.reference
        : typeof inner?.tx_ref === "string"
          ? inner.tx_ref
          : null,
    amountEtb: Number.isFinite(amount) ? Math.round(amount) : null,
    payload: response.data,
  }
}

// --------------------------------------------------------------------------
// Webhook authenticity
// --------------------------------------------------------------------------

/**
 * Checks a webhook came from Chapa.
 *
 * Chapa signs with the webhook secret from the dashboard and has shipped two
 * header conventions: `Chapa-Signature`, an HMAC-SHA256 of the raw request
 * body, and `x-chapa-signature`, an HMAC-SHA256 of the secret itself. Both are
 * accepted because which one arrives depends on when the endpoint was
 * registered, and rejecting the older one would silently drop live payments.
 *
 * Compared with `timingSafeEqual`. The comparison is on hex digests of fixed
 * length, so a mismatched length here means a malformed header, not a near miss.
 *
 * With no CHAPA_WEBHOOK_SECRET configured this returns false — an unverifiable
 * webhook is refused rather than trusted. The reservation still completes: the
 * browser return hits the verify route, which asks Chapa directly.
 */
export function verifyWebhookSignature(
  rawBody: string,
  headers: Headers
): boolean {
  const secret = process.env.CHAPA_WEBHOOK_SECRET?.trim()
  if (!secret) return false

  const presented =
    headers.get("chapa-signature") ?? headers.get("x-chapa-signature")
  if (!presented) return false

  const candidates = [
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex"),
    crypto.createHmac("sha256", secret).update(secret).digest("hex"),
  ]

  return candidates.some((expected) => safeEqualHex(presented.trim(), expected))
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
  } catch {
    return false
  }
}

// --------------------------------------------------------------------------
// Transport
// --------------------------------------------------------------------------

type ChapaEnvelope = {
  status?: string
  message?: string
  data?: {
    checkout_url?: string
    status?: string
    amount?: string | number
    reference?: string
    tx_ref?: string
  } | null
}

function secretKey(): string {
  return process.env.CHAPA_SECRET_KEY?.trim() ?? ""
}

async function postJson(
  url: string,
  body: unknown
): Promise<ChapaResult<{ data: unknown }>> {
  return request(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

async function getJson(url: string): Promise<ChapaResult<{ data: unknown }>> {
  return request(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${secretKey()}` },
  })
}

async function request(
  url: string,
  init: RequestInit
): Promise<ChapaResult<{ data: unknown }>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    })
    const text = await response.text()

    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { raw: text.slice(0, 400) }
    }

    if (!response.ok) {
      const message = (data as ChapaEnvelope)?.message
      return {
        ok: false,
        error:
          typeof message === "string" && message
            ? message
            : `Chapa returned ${response.status}.`,
        detail: text.slice(0, 400),
      }
    }

    return { ok: true, data }
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError"
    return {
      ok: false,
      error: aborted
        ? "Chapa did not respond in time. Nothing was charged."
        : "Could not reach Chapa. Nothing was charged.",
      detail: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}
