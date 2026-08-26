import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Postgres throws on a malformed uuid literal — check before it ever reaches a query. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

/**
 * Narrows a `?next=` parameter to something safe to redirect a browser to.
 *
 * Anything that is not a plain same-origin path is dropped. The cases that
 * matter are `//evil.example` and `/\\evil.example`, which browsers resolve as
 * protocol-relative URLs to another host, and absolute URLs carrying a scheme.
 * Letting any of those through would turn the login flow into an open
 * redirector, which is how a phishing link gets to wear our domain.
 *
 * Returns null when the value cannot be trusted, so callers fall back to "/"
 * rather than to whatever was in the query string.
 */
export function safeRedirectPath(
  value: string | null | undefined
): string | null {
  if (!value || value.length > 512) return null
  if (!value.startsWith("/")) return null
  if (value.startsWith("//") || value.startsWith("/\\")) return null
  // A control character in a Location header is a response-splitting attempt.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null
  return value
}
