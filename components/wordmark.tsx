import Link from "next/link"

import { getLang, strings } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * The name is Amharic, so the wordmark leads in Amharic. "gulit" trails it as a
 * transliteration in the ledger register, the same way every channel handle and
 * count on the site is set.
 */
export async function Wordmark({ className }: { className?: string }) {
  const s = strings(await getLang())

  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-baseline gap-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
        className
      )}
    >
      <span className="text-[1.3125rem] leading-none font-bold tracking-tight text-foreground">
        Gulit
      </span>
      <span className="type-ledger text-xs text-muted-foreground">
        {s.wordmarkTag}
      </span>
      <span className="sr-only">{s.wordmarkSr}</span>
    </Link>
  )
}
