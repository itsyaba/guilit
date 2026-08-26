import { IconSearchOff } from "@tabler/icons-react"

import { CtaLink, Shell } from "@/components/kit"

/**
 * Listings disappear for good reasons: sold, withdrawn, or removed by a seller
 * who claimed it. Say that rather than showing a bare 404.
 */
export default function ListingNotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 sm:px-6">
      <Shell coreClassName="flex flex-col items-center px-6 py-16 text-center">
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-full bg-tray ring-1 ring-hairline"
        >
          <IconSearchOff
            stroke={1.5}
            className="size-6 text-muted-foreground"
          />
        </span>

        <p className="type-ledger mt-6 text-muted-foreground">404</p>
        <h1 className="type-display mt-3 text-xl font-semibold text-foreground">
          This listing is gone
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          It was sold, withdrawn, or removed at the seller&rsquo;s request.
          Similar items usually turn up again within a few days.
        </p>

        <div className="mt-8">
          <CtaLink href="/browse">Browse everything</CtaLink>
        </div>
      </Shell>
    </div>
  )
}
