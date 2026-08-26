import { sql } from "drizzle-orm"

import { db } from "@/db/client"
import {
  channels,
  listings,
  rawMessages,
  removalRequests,
  reports,
} from "@/db/schema"

/**
 * The console's overview figures.
 *
 * Five queries, one sequential scan each, because every figure a moderator
 * opens the console for is a count over a different table and there is no join
 * that makes them cheaper together. Per table the counts are folded into a
 * single statement with FILTER clauses rather than issued one at a time: eight
 * counts over `listings` as eight queries is eight scans of the same table.
 *
 * Nothing here is cached. These numbers exist to tell a moderator what is
 * waiting for them right now, and a stale queue depth is worse than no queue
 * depth -- it sends someone to an empty queue, or worse, leaves a full one
 * looking handled.
 */
export type AdminStats = {
  queue: {
    /** Listings sitting at status = 'queued', awaiting a decision. */
    depth: number
    /** Of those, how many arrived in the last 24 hours. */
    today: number
  }
  listings: { live: number; hidden: number; removed: number }
  reports: { total: number; week: number }
  removals: { pending: number }
  channels: { total: number; active: number }
  ingest: {
    messages: number
    /** raw_messages with processed_at IS NULL — the extraction backlog. */
    unprocessed: number
    /** The most recent captured post, or null on an empty index. */
    lastCapturedAt: string | null
  }
}

export async function getAdminStats(): Promise<AdminStats> {
  const [listingRows, reportRows, removalRows, channelRows, ingestRows] =
    await Promise.all([
      db
        .select({
          queued: sql<number>`count(*) filter (where status = 'queued')::int`,
          queuedToday: sql<number>`count(*) filter (where status = 'queued' and created_at > now() - interval '24 hours')::int`,
          live: sql<number>`count(*) filter (where status = 'live')::int`,
          hidden: sql<number>`count(*) filter (where status = 'hidden')::int`,
          removed: sql<number>`count(*) filter (where status = 'removed')::int`,
        })
        .from(listings),
      db
        .select({
          total: sql<number>`count(*)::int`,
          week: sql<number>`count(*) filter (where created_at > now() - interval '7 days')::int`,
        })
        .from(reports),
      db
        .select({
          pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        })
        .from(removalRequests),
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where active)::int`,
        })
        .from(channels),
      db
        .select({
          total: sql<number>`count(*)::int`,
          unprocessed: sql<number>`count(*) filter (where processed_at is null)::int`,
          lastCapturedAt: sql<string | null>`max(posted_at)`,
        })
        .from(rawMessages),
    ])

  return {
    queue: {
      depth: listingRows[0]?.queued ?? 0,
      today: listingRows[0]?.queuedToday ?? 0,
    },
    listings: {
      live: listingRows[0]?.live ?? 0,
      hidden: listingRows[0]?.hidden ?? 0,
      removed: listingRows[0]?.removed ?? 0,
    },
    reports: {
      total: reportRows[0]?.total ?? 0,
      week: reportRows[0]?.week ?? 0,
    },
    removals: { pending: removalRows[0]?.pending ?? 0 },
    channels: {
      total: channelRows[0]?.total ?? 0,
      active: channelRows[0]?.active ?? 0,
    },
    ingest: {
      messages: ingestRows[0]?.total ?? 0,
      unprocessed: ingestRows[0]?.unprocessed ?? 0,
      lastCapturedAt: ingestRows[0]?.lastCapturedAt ?? null,
    },
  }
}
