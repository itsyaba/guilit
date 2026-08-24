import { requireAdmin } from '@/lib/session'
import { db } from '@/db/client'
import { removalRequests, listings } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { formatDistanceToNow } from 'date-fns'
import { RemovalActions } from './components/removal-actions'

export const metadata = {
  title: 'Removals',
}

export default async function RemovalsPage() {
  await requireAdmin()

  const items = await db
    .select({
      id: removalRequests.id,
      listingId: listings.id,
      titleEn: listings.titleEn,
      titleAm: listings.titleAm,
      claimantPhone: removalRequests.claimantPhone,
      detail: removalRequests.detail,
      createdAt: removalRequests.createdAt,
    })
    .from(removalRequests)
    .innerJoin(listings, eq(listings.id, removalRequests.listingId))
    .where(eq(removalRequests.status, 'pending'))
    .orderBy(desc(removalRequests.createdAt))

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950">Pending Removals</h1>
        <p className="text-sm text-zinc-500 mt-1">Review takedown requests from original posters.</p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-zinc-200">
          <p className="text-zinc-500">No pending removal requests.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-white p-5 rounded-lg border border-zinc-200 shadow-sm flex flex-col sm:flex-row gap-4 sm:items-start sm:justify-between">
              <div className="space-y-1">
                <h3 className="font-semibold text-zinc-900">
                  {item.titleEn || item.titleAm || item.listingId.split('-')[0]}
                </h3>
                <div className="text-sm text-zinc-600">
                  <span className="font-medium">Claimant:</span> {item.claimantPhone ? maskPhone(item.claimantPhone) : 'Unknown'}
                </div>
                {item.detail && (
                  <p className="text-sm text-zinc-500 mt-2 bg-zinc-50 p-2 rounded border border-zinc-100">
                    &ldquo;{item.detail}&rdquo;
                  </p>
                )}
                <div className="text-xs text-zinc-400 mt-2">
                  Requested {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </div>
              </div>
              <div className="shrink-0">
                <RemovalActions id={item.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function maskPhone(phone: string) {
  if (!phone || phone.length < 6) return phone
  return phone.slice(0, 4) + '****' + phone.slice(-2)
}
