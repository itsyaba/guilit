import { desc, eq } from "drizzle-orm"
import { formatDistanceToNow } from "date-fns"
import { IconQuote } from "@tabler/icons-react"

import { Eyebrow, Shell } from "@/components/kit"
import { db } from "@/db/client"
import { listings, removalRequests } from "@/db/schema"
import { requireAdmin } from "@/lib/session"
import { RemovalActions } from "./components/removal-actions"

export const metadata = {
  title: "Removals",
}

/**
 * Takedown claims, oldest decision first.
 *
 * One card per claim rather than a table: each row is a judgement call on three
 * unlike pieces of evidence -- who says they own it, what they say about it,
 * how long they have waited -- and a judgement call wants a card with room in
 * it, not a cell.
 */
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
    .where(eq(removalRequests.status, "pending"))
    .orderBy(desc(removalRequests.createdAt))

  return (
    <div className="anim-rise mx-auto max-w-[64rem] px-1 pb-16 sm:px-2">
      <header className="max-w-2xl">
        <Eyebrow>Right to erasure</Eyebrow>
        <h1 className="type-section type-display mt-4 font-semibold text-foreground">
          Pending removals
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Takedown requests from original posters. Approving one sets the
          listing to <span className="font-mono text-sm">removed</span> and
          keeps the row — nothing here hard-deletes.
        </p>
      </header>

      {items.length === 0 ? (
        <Shell className="mt-10" coreClassName="px-6 py-16 text-center">
          <p className="text-base text-muted-foreground">
            No pending removal requests.
          </p>
        </Shell>
      ) : (
        <div className="mt-10 grid gap-4">
          {items.map((item) => (
            <Shell
              key={item.id}
              coreClassName="flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <h2
                  lang="am"
                  className="type-display text-lg font-semibold text-foreground"
                >
                  {item.titleEn || item.titleAm || item.listingId.split("-")[0]}
                </h2>

                <dl className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="flex items-baseline gap-2">
                    <dt className="type-ledger text-muted-foreground">
                      Claimant
                    </dt>
                    <dd className="text-sm font-medium text-foreground tabular-nums">
                      {item.claimantPhone
                        ? maskPhone(item.claimantPhone)
                        : "Unknown"}
                    </dd>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <dt className="type-ledger text-muted-foreground">
                      Waiting
                    </dt>
                    <dd className="text-sm font-medium text-foreground">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                      })}
                    </dd>
                  </div>
                </dl>

                {item.detail ? (
                  <blockquote className="mt-4 flex gap-3 rounded-tile bg-tray p-4 text-sm leading-relaxed text-foreground ring-1 ring-hairline">
                    <IconQuote
                      aria-hidden="true"
                      stroke={1.5}
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span lang="am">{item.detail}</span>
                  </blockquote>
                ) : null}
              </div>

              <div className="shrink-0">
                <RemovalActions id={item.id} />
              </div>
            </Shell>
          ))}
        </div>
      )}
    </div>
  )
}

function maskPhone(phone: string) {
  if (!phone || phone.length < 6) return phone
  return phone.slice(0, 4) + "****" + phone.slice(-2)
}
