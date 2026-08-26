import { desc, sql } from "drizzle-orm"

import { Eyebrow, Shell } from "@/components/kit"
import { db } from "@/db/client"
import { channels } from "@/db/schema"
import { requireAdmin } from "@/lib/session"
import { AddChannelForm } from "./components/add-channel-form"
import { ChannelRow } from "./components/channel-row"

export const metadata = {
  title: "Channels",
}

export default async function ChannelsPage() {
  await requireAdmin()

  // Every correlated subquery below must name the outer column as
  // "channels"."id". Interpolating ${channels.id} renders it bare as "id",
  // because the outer select touches one table and Drizzle drops the prefix.
  // Inside these subqueries that is wrong twice over: against the joined
  // tables it matches listings.id, listing_sources.id and raw_messages.id at
  // once and Postgres refuses the whole query with 42702; against the lone
  // raw_messages scan it silently binds to raw_messages.id instead, counting
  // rows whose channel_id equals their own id. Keep the table qualifier.
  const channelId = sql.raw('"channels"."id"')

  const items = await db
    .select({
      id: channels.id,
      username: channels.username,
      title: channels.title,
      active: channels.active,
      messageCount: sql<number>`(
        SELECT COUNT(*)
        FROM raw_messages rm
        WHERE rm.channel_id = ${channelId}
      )::int`,
      listingCount: sql<number>`(
        SELECT COUNT(*)
        FROM listings l
        INNER JOIN listing_sources ls ON ls.listing_id = l.id
        INNER JOIN raw_messages rm ON rm.id = ls.raw_message_id
        WHERE rm.channel_id = ${channelId}
      )::int`,
      rejectedCount: sql<number>`(
        SELECT COUNT(*)
        FROM listings l
        INNER JOIN listing_sources ls ON ls.listing_id = l.id
        INNER JOIN raw_messages rm ON rm.id = ls.raw_message_id
        WHERE rm.channel_id = ${channelId} AND l.status = 'removed'
      )::int`,
    })
    .from(channels)
    .orderBy(desc(channels.createdAt))
    .limit(100)

  return (
    <div className="anim-rise mx-auto max-w-[80rem] px-1 pb-16 sm:px-2">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <Eyebrow>Ingestion</Eyebrow>
          <h1 className="type-section type-display mt-4 font-semibold text-foreground">
            Channels
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            The allowlist the listener reads from. Switching a channel off stops
            capture without touching what it has already posted.
          </p>
        </div>
        <div className="shrink-0">
          <AddChannelForm />
        </div>
      </header>

      <Shell className="mt-10" coreClassName="overflow-hidden">
        {/* Scrolls inside its own core rather than widening the page. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline">
                <Th>Channel</Th>
                <Th>Title</Th>
                <Th>Capture</Th>
                <Th align="right">Messages</Th>
                <Th align="right">Listings</Th>
                <Th align="right">Rejected</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center text-muted-foreground"
                  >
                    No channels on the allowlist yet.
                  </td>
                </tr>
              ) : (
                items.map((channel) => {
                  const totalListings =
                    channel.listingCount + channel.rejectedCount
                  const rejectRate =
                    totalListings > 0
                      ? channel.rejectedCount / totalListings
                      : 0
                  return (
                    <ChannelRow
                      key={channel.id}
                      channel={{ ...channel, rejectRate }}
                    />
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Shell>
    </div>
  )
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode
  align?: "left" | "right"
}) {
  return (
    <th
      scope="col"
      className={`type-ledger px-6 py-4 font-normal text-muted-foreground ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  )
}
