import Link from "next/link"

import { Wordmark } from "@/components/wordmark"
import { getLang, strings } from "@/lib/i18n"
import { formatAmount } from "@/lib/format"
import { getFilterOptions } from "@/lib/listings"

export async function SiteFooter() {
  const [{ categories, channelCount }, lang] = await Promise.all([
    getFilterOptions(),
    getLang(),
  ])
  const s = strings(lang)

  const aboutLinks = [
    { href: "/browse", label: s.footerBrowseListings },
    { href: "/browse?tier=native", label: s.footerNative },
    { href: "/browse?sort=channels", label: s.footerCrossPosted },
  ]

  const trustLinks = [
    { href: "/browse", label: s.footerHowItWorks },
    { href: "/browse", label: s.footerMeetingSafely },
    { href: "/browse", label: s.footerScamPatterns },
    { href: "/browse", label: s.footerReport },
  ]

  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto grid max-w-[90rem] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Wordmark />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {s.footerBlurb(formatAmount(channelCount))}
          </p>
        </div>

        <FooterColumn title={s.footerBrowse}>
          {categories.slice(0, 6).map((category) => (
            <FooterLink key={category.slug} href={`/browse?category=${category.slug}`}>
              {lang === "am" ? category.labelAm : category.label}
            </FooterLink>
          ))}
        </FooterColumn>

        <FooterColumn title={s.footerMarketplace}>
          {aboutLinks.map((link) => (
            <FooterLink key={link.label} href={link.href}>
              {link.label}
            </FooterLink>
          ))}
        </FooterColumn>

        <FooterColumn title={s.footerTrust}>
          {trustLinks.map((link) => (
            <FooterLink key={link.label} href={link.href}>
              {link.label}
            </FooterLink>
          ))}
        </FooterColumn>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-2 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p className="type-ledger type-mixed text-muted-foreground">
            {s.footerTagline}
          </p>
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
            {s.footerRights}
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
