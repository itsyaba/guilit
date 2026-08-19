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

  // For real production we'd do complex joins here, but let's approximate with sql helpers.
  // Assuming a generic structure for channels: id, username, title, isActive
  const items = await db
    .select({
      id: channels.id,
      username: channels.username,
      title: channels.title,
      active: channels.active,
      messageCount: sql<number>`(SELECT COUNT(*) FROM raw_messages WHERE raw_messages.channel_id = ${channels.id})::int`,
      listingCount: sql<number>`(
        SELECT COUNT(*) 
        FROM listings 
        INNER JOIN listing_sources ON listing_sources.listing_id = listings.id
        INNER JOIN raw_messages ON raw_messages.id = listing_sources.raw_message_id
        WHERE raw_messages.channel_id = ${channels.id}
      )::int`,
      rejectedCount: sql<number>`(
        SELECT COUNT(*) 
        FROM listings 
        INNER JOIN listing_sources ON listing_sources.listing_id = listings.id
        INNER JOIN raw_messages ON raw_messages.id = listing_sources.raw_message_id
        WHERE raw_messages.channel_id = ${channels.id} AND listings.status = 'removed'
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
