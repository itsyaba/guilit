import Link from "next/link"

import { Wordmark } from "@/components/wordmark"
import { getFilterOptions } from "@/lib/listings"

const ABOUT_LINKS = [
  { href: "/browse", label: "Browse listings" },
  { href: "/browse?tier=native", label: "Posted on Gulit" },
  { href: "/browse?sort=channels", label: "Cross-posted items" },
]

const TRUST_LINKS = [
  { href: "/browse", label: "How Gulit works" },
  { href: "/browse", label: "Meeting a seller safely" },
  { href: "/browse", label: "Scam patterns to know" },
  { href: "/browse", label: "Report a listing" },
]

export async function SiteFooter() {
  const { categories, channelCount } = await getFilterOptions()

  return (
    <footer className="mt-16 border-t border-border bg-muted/40">
      <div className="mx-auto grid max-w-[90rem] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Wordmark />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Gulit indexes second-hand listings from {channelCount} Telegram
            channels across Addis Ababa. We link back to every original post and
            route contact to the seller who wrote it.
          </p>
        </div>

        <FooterColumn title="Browse">
          {categories.slice(0, 6).map((category) => (
            <FooterLink key={category.slug} href={`/browse?category=${category.slug}`}>
              {category.label}
            </FooterLink>
          ))}
        </FooterColumn>

        <FooterColumn title="Marketplace">
          {ABOUT_LINKS.map((link) => (
            <FooterLink key={link.label} href={link.href}>
              {link.label}
            </FooterLink>
          ))}
        </FooterColumn>

        <FooterColumn title="Trust & safety">
          {TRUST_LINKS.map((link) => (
            <FooterLink key={link.label} href={link.href}>
              {link.label}
            </FooterLink>
          ))}
        </FooterColumn>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-2 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p className="type-ledger type-mixed text-muted-foreground">
            ጉሊት — the open-air market, indexed
          </p>
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
            Indexed listings remain the property of whoever posted them. If a
            listing is yours and you want it gone, one tap removes it.
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h2 className="type-ledger text-foreground">{title}</h2>
      <ul className="mt-3 space-y-2">{children}</ul>
    </div>
  )
}

function FooterLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <li>
      <Link
        href={href}
        className="rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {children}
      </Link>
    </li>
  )
}
