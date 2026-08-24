import type { Metadata } from "next"

import { AlertsBand } from "@/components/landing/alerts-band"
import { CategoryTable } from "@/components/landing/category-table"
import { Collapse, CollapseSingle } from "@/components/landing/collapse"
import { LandingHero } from "@/components/landing/hero"
import { IndexBand } from "@/components/landing/index-band"
import { InventoryStrip } from "@/components/landing/inventory-strip"
import { PriceFairness } from "@/components/landing/price-fairness"
import { Provenance } from "@/components/landing/provenance"
import { SearchIntelligence } from "@/components/landing/search-intelligence"
import { SellBand } from "@/components/landing/sell-band"
import { getLang } from "@/lib/i18n"
import { getLandingPayload } from "@/lib/landing"
import { getSessionUser } from "@/lib/session"

export const metadata: Metadata = {
  title: "Gulit: buy and sell used goods in Addis Ababa",
  description:
    "A used-goods marketplace for Addis Ababa. Search listings collected from Telegram channels and posted directly by sellers, filter by price, condition and neighbourhood, and contact the seller on Telegram or by phone.",
}

/**
 * The landing page.
 *
 * Rendered entirely on the server. The only JavaScript that reaches the browser
 * from this route is the search field's sentence parser, the alert form, and an
 * error handler on listing photographs -- there is no client fetch for anything
 * above the fold and no skeleton where SSR would do, because the audience is a
 * mid-range Android on Ethiopian mobile data and a loading state is a second
 * round trip they pay for.
 *
 * The order answers a visitor's questions as they ask them: what can I search,
 * what is actually for sale, how much is here and how fresh is it, what do you
 * do that the channels do not, where do I start, does the search really work,
 * am I being overcharged, can you watch for me, who am I buying from, and how
 * do I sell.
 *
 * Every band is live data or a shipped feature. One await, one payload, props
 * down -- see lib/landing.
 */
export default async function Home() {
  const [lang, payload, user] = await Promise.all([
    getLang(),
    getLandingPayload(),
    getSessionUser(),
  ])
  const { stats, categories, cluster, bucket, showcase } = payload

  return (
    <>
      <LandingHero stats={stats} lang={lang} />
      <InventoryStrip listings={showcase} lang={lang} />
      <IndexBand stats={stats} lang={lang} />

      {/*
       * The dedup demonstration, or an honest statement that there is nothing
       * cross-posted to demonstrate with. Never a fabricated cluster: a made-up
       * example here would undo the exact claim it illustrates.
       */}
      {cluster ? (
        <Collapse cluster={cluster} lang={lang} />
      ) : showcase[0]?.sources[0] ? (
        <CollapseSingle
          handle={showcase[0].sources[0].channelHandle}
          lang={lang}
        />
      ) : null}

      <CategoryTable categories={categories} lang={lang} />
      <SearchIntelligence lang={lang} />
      <PriceFairness bucket={bucket} lang={lang} />
      <AlertsBand lang={lang} signedIn={user !== null} />
      <Provenance lang={lang} />
      <SellBand lang={lang} />
    </>
  )
}
