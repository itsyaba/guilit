import type { Metadata, Viewport } from "next"
import { Archivo, DM_Mono } from "next/font/google"
import localFont from "next/font/local"

import "./globals.css"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { getLang, strings } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Archivo, weight axis only.
 *
 * It used to carry the width axis as well, for a second wider voice on the
 * wordmark and headings out of one file. Measured on a simulated 1.6 Mbps link
 * that second axis cost 43 KB of High-priority bandwidth sitting directly in
 * front of the largest text on the page -- the whole font payload was 136 KB and
 * the hero paragraph is the LCP element. A 12% widening on headings is not worth
 * a second of LCP to the shopper it is aimed at, so the axis is gone and
 * `.type-display` keeps only its tighter tracking.
 */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
})

/**
 * The ledger register: channel handles, counts, dates.
 *
 * One weight. The 500 was a second 9 KB file for a single `font-medium` on an
 * admin screen, which is not a page with a performance budget.
 */
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-mono",
  display: "swap",
})

/**
 * Noto Sans Ethiopic, cut down to the Ethiopic block with the weight axis
 * clamped to 400-600: 30 KB instead of the 1.1 MB full face. Rebuild it with
 * `scripts/build-ethiopic-subset.sh`. Latin is deliberately absent -- Archivo
 * covers it, and this face only ever renders Amharic runs.
 *
 * No fallback stack: a system Ethiopic face is a lottery -- present on one
 * Android build, absent on the next, and metrically unlike this one wherever it
 * does exist. This file is the difference between ግዕዝ and tofu.
 *
 * Preloaded, and that was measured both ways. Dropping the preload to spare
 * English readers 30 KB made LCP a second *worse*: the English page paints
 * Ethiopic too -- the ላፕቶፕ search examples, the ጉሊት mark in the footer -- so the
 * face is needed either way, and without the preload it stops being discovered
 * in parallel and becomes a second round trip hanging off the stylesheet.
 */
const notoEthiopic = localFont({
  src: "../assets/fonts/NotoSansEthiopic-Ethiopic-400-600.woff2",
  weight: "400 600",
  style: "normal",
  variable: "--font-ethiopic",
  display: "swap",
  preload: true,
})

export const metadata: Metadata = {
  title: {
    default: "Gulit — used goods across Addis, in one place",
    template: "%s · Gulit",
  },
  description:
    "Gulit indexes second-hand listings from Telegram channels across Addis Ababa into one searchable marketplace, with duplicates collapsed and every listing linked back to where it was posted.",
}

/**
 * One theme, so one colour. The site is light-only -- there is no `.dark` token
 * block and nothing puts the class on <html> -- and handing Android a dark
 * theme-colour for a page that is never dark just mismatches the browser chrome
 * against the page under it.
 */
export const viewport: Viewport = {
  themeColor: "#fbfbfc",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Resolved by the proxy from the cookie, or from Accept-Language on a first
  // visit. Server-rendered onto <html>, so an Amharic reader gets an Amharic
  // page on first paint rather than an English one that swaps after hydration
  // -- and so the :lang(am) leading rules apply before any text is drawn.
  const lang = await getLang()
  const s = strings(lang)

  return (
    <html
      lang={lang}
      className={cn(
        "antialiased",
        archivo.variable,
        dmMono.variable,
        notoEthiopic.variable
      )}
    >
      <body className="min-h-svh font-sans">
        <a
          href="#main"
          className="sr-only rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
        >
          {s.skipToResults}
        </a>
        <div className="flex min-h-svh flex-col">
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  )
}
