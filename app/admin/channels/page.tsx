import { requireAdmin } from '@/lib/session'
import { db } from '@/db/client'
import { channels } from '@/db/schema'
import { desc, sql } from 'drizzle-orm'
import { AddChannelForm } from './components/add-channel-form'
import { ChannelRow } from './components/channel-row'

export const metadata = {
  title: 'Channels',
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
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950">Channels</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage Telegram channels ingested by Gulit.</p>
        </div>
        <AddChannelForm />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-xs uppercase text-zinc-500 font-semibold">
            <tr>
              <th className="px-6 py-3">Username</th>
              <th className="px-6 py-3">Title</th>
              <th className="px-6 py-3">Active</th>
              <th className="px-6 py-3 text-right">Messages</th>
              <th className="px-6 py-3 text-right">Listings</th>
              <th className="px-6 py-3 text-right">Rejection Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                  No channels found.
                </td>
              </tr>
            ) : (
              items.map((channel) => {
                const totalListings = channel.listingCount + channel.rejectedCount
                const rejectRate = totalListings > 0 ? channel.rejectedCount / totalListings : 0
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
    </div>
  )
}
