import { requireAdmin } from '@/lib/session'
import { db } from '@/db/client'
import { reports, listings } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

export const metadata = {
  title: 'Reports',
}

export default async function ReportsPage() {
  await requireAdmin()

  const items = await db
    .select({
      id: reports.id,
      reason: reports.reason,
      detail: reports.detail,
      createdAt: reports.createdAt,
      listingId: listings.id,
      titleEn: listings.titleEn,
      titleAm: listings.titleAm,
    })
    .from(reports)
    .innerJoin(listings, eq(listings.id, reports.listingId))
    .orderBy(desc(reports.createdAt))
    .limit(100)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950">Reports</h1>
        <p className="text-sm text-zinc-500 mt-1">User reports on listings.</p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-xs uppercase text-zinc-500 font-semibold">
            <tr>
              <th className="px-6 py-3">Reason</th>
              <th className="px-6 py-3">Detail</th>
              <th className="px-6 py-3">Listing</th>
              <th className="px-6 py-3 text-right">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                  No reports found.
                </td>
              </tr>
            ) : (
              items.map((report) => (
                <tr key={report.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-zinc-900 capitalize">
                    {report.reason.replace(/_/g, ' ')}
                  </td>
                  <td className="px-6 py-4 text-zinc-600 max-w-md truncate">
                    {report.detail || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <Link 
                      href={`/listing/${report.listingId}`}
                      className="text-primary hover:underline font-medium"
                      target="_blank"
                    >
                      {report.titleEn || report.titleAm || report.listingId.split('-')[0]}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-right text-zinc-500 whitespace-nowrap">
                    {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
