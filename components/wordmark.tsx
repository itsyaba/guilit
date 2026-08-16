import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * The name is Amharic, so the wordmark leads in Amharic. "gulit" trails it as a
 * transliteration in the ledger register, the same way every channel handle and
 * count on the site is set.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/browse"
      className={cn(
        "inline-flex items-baseline gap-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
        className
      )}
    >
      <span className="text-[1.3125rem] leading-none font-bold tracking-tight text-foreground">
        Gulit
      </span>
      <span className="type-ledger text-muted-foreground text-xs">marketplace</span>
      <span className="sr-only">— used goods across Addis Ababa</span>
    </Link>
  )
}
