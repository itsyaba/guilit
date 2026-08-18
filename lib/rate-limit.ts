import { and, eq, gt, sql } from "drizzle-orm"

import { db } from "@/db/client"
import { rateLimitHits } from "@/db/schema"

/**
 * Fixed-window rate limit backed by Postgres — no Redis in this stack.
 * Counts hits for `key` inside the trailing window, then records this hit.
 * Returns false when the caller should be rejected (429).
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const since = new Date(Date.now() - windowSeconds * 1000)

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(rateLimitHits)
    .where(and(eq(rateLimitHits.key, key), gt(rateLimitHits.createdAt, since)))

  if (Number(row?.count ?? 0) >= limit) return false

  await db.insert(rateLimitHits).values({ key })
  return true
}

/** Best-effort client IP for rate-limit keys behind Caddy/docker-compose. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return request.headers.get("x-real-ip") ?? "unknown"
}
