import type { Metadata, Viewport } from "next"
import { Archivo, DM_Mono } from "next/font/google"
import localFont from "next/font/local"

import "./globals.css"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

/**
 * Archivo is variable on both weight and width. Loading the width axis gives us
 * a second, wider voice for the wordmark and headings without a second file.
 */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
})

/** The ledger register: channel handles, counts, dates. */
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
})

/**
 * Noto Sans Ethiopic, cut down to the Ethiopic block with the weight axis
 * clamped to 400-600: 30 KB instead of the 1.1 MB full face. Rebuild it with
 * `scripts/build-ethiopic-subset.sh`. Latin is deliberately absent -- Archivo
 * covers it, and this face only ever renders Amharic runs.
 */
const notoEthiopic = localFont({
  src: "../assets/fonts/NotoSansEthiopic-Ethiopic-400-600.woff2",
  weight: "400 600",
  style: "normal",
  variable: "--font-ethiopic",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
})

export const metadata: Metadata = {
  title: {
    default: "Gulit — used goods across Addis, in one place",
    template: "%s · Gulit",
  },
  description:
    "Gulit indexes second-hand listings from Telegram channels across Addis Ababa into one searchable marketplace, with duplicates collapsed and every listing linked back to where it was posted.",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1e24" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        archivo.variable,
        dmMono.variable,
        notoEthiopic.variable
      )}
    >
      <body className="min-h-svh font-sans">
        <ThemeProvider>
          <a
            href="#main"
            className="sr-only rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
          >
            Skip to results
          </a>
          <div className="flex min-h-svh flex-col">
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
