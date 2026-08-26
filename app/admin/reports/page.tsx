import Link from "next/link"
import { desc, eq } from "drizzle-orm"
import { formatDistanceToNow } from "date-fns"
import { IconArrowUpRight } from "@tabler/icons-react"

import { Eyebrow, Shell } from "@/components/kit"
import { db } from "@/db/client"
import { listings, reports } from "@/db/schema"
import { requireAdmin } from "@/lib/session"

export const metadata = {
  title: "Reports",
}

/**
 * User reports, newest first.
 *
 * A table, because that is what this is -- four short fields per row and a
 * hundred rows to scan down. What changed is the frame: the rules are the
 * hairline the rest of the product draws in, the header row is the ledger
 * register rather than bold small caps, and the whole thing sits in a tray so
 * it reads as one object with an edge instead of a grid bleeding into the page.
 */
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
    <div className="anim-rise mx-auto max-w-[80rem] px-1 pb-16 sm:px-2">
      <header className="max-w-2xl">
        <Eyebrow>Trust &amp; safety</Eyebrow>
        <h1 className="type-section type-display mt-4 font-semibold text-foreground">
          Reports
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          What shoppers flagged, and on which listing. Three reports on one row
          hide it and send it to the queue automatically.
        </p>
      </header>

      <Shell className="mt-10" coreClassName="overflow-hidden">
        {/* Scrolls inside its own core rather than widening the page: four
            columns of prose do not fit a 390px screen and never will. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline">
                <Th>Reason</Th>
                <Th>Detail</Th>
                <Th>Listing</Th>
                <Th align="right">Reported</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-16 text-center text-muted-foreground"
                  >
                    No reports yet.
                  </td>
                </tr>
              ) : (
                items.map((report) => (
                  <tr
                    key={report.id}
                    className="group/row transition-colors duration-500 ease-fluid hover:bg-tray/60"
                  >
                    <td className="px-6 py-4 font-medium text-foreground capitalize">
                      {report.reason.replace(/_/g, " ")}
                    </td>
                    <td className="max-w-md truncate px-6 py-4 text-muted-foreground">
                      {report.detail || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/listing/${report.listingId}`}
                        target="_blank"
                        lang="am"
                        className="inline-flex items-center gap-1.5 font-medium text-foreground transition-colors duration-500 ease-fluid hover:text-primary"
                      >
                        {report.titleEn ||
                          report.titleAm ||
                          report.listingId.split("-")[0]}
                        <IconArrowUpRight
                          aria-hidden="true"
                          stroke={1.5}
                          className="size-4 shrink-0 opacity-0 transition-opacity duration-500 ease-fluid group-hover/row:opacity-60"
                        />
                      </Link>
                    </td>
                    <td className="type-ledger px-6 py-4 text-right whitespace-nowrap text-muted-foreground">
                      {formatDistanceToNow(new Date(report.createdAt), {
                        addSuffix: true,
                      })}
                    </td>
                  </tr>
                ))
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
