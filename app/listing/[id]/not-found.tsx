import Link from "next/link"

import { Button } from "@/components/ui/button"

/**
 * Listings disappear for good reasons: sold, withdrawn, or removed by a seller
 * who claimed it. Say that rather than showing a bare 404.
 */
export default function ListingNotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <p className="type-ledger text-muted-foreground">404</p>
      <h1 className="mt-3 text-lg font-semibold text-foreground">
        This listing is gone
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        It was sold, withdrawn, or removed at the seller&rsquo;s request. Similar
        items usually turn up again within a few days.
      </p>
      <Button render={<Link href="/browse" />} className="mt-6 rounded-lg">
        Browse everything
      </Button>
    </div>
  )
}
