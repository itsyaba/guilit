/**
 * Opening a Chapa checkout from inside a thread.
 *
 * Shared by the deal rail and the Pay button on a request card, because both do
 * the same three things and getting any of them different would be a bug: post
 * to the conversation's pay route, hand back a sentence on failure, and on
 * success leave the SPA entirely.
 *
 * `window.location.assign`, not a router push: the destination is a payment
 * page on another origin (or, in mock mode, a route handler that redirects).
 * Neither belongs inside a client-side navigation.
 */
export async function startCheckout(
  conversationId: string,
  requestMessageId?: string
): Promise<string | null> {
  const res = await fetch(`/api/conversations/${conversationId}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestMessageId ? { requestMessageId } : {}),
  })

  if (res.ok) {
    const data = await res.json()
    window.location.assign(data.checkoutUrl as string)
    // Navigation is underway; the caller must not clear its pending state or
    // the button flickers back to idle while the page is already leaving.
    return null
  }

  const payload = await res.json().catch(() => ({}))
  return (
    (payload.error as string | undefined) ??
    "Could not open the checkout. Nothing was charged."
  )
}
