import {
  PRICE_STATS_TTL_SECONDS,
  refreshPriceStats,
} from "@/lib/price-stats"

/**
 * Keeps price_stats fresh without adding a container.
 *
 * Started from instrumentation.ts on server boot. Deliberately fire-and-forget:
 * register() blocks the server from accepting requests until it resolves, so
 * awaiting a refresh here would add its duration to cold start.
 *
 * This is the primary mechanism; ensureFreshPriceStats() in the price-context
 * route is the backstop, so the numbers are still correct if this never runs
 * (a serverless deploy, a crashed interval). Both are cheap because the
 * refresh no-ops when another one holds the advisory lock.
 */

let started = false

export function startPriceStatsScheduler(): void {
  // The module can be re-evaluated on HMR; a second interval would be silent
  // duplicate work.
  if (started) return
  started = true

  const run = () => {
    refreshPriceStats().catch((error) => {
      console.error("[price-stats] refresh failed", error)
    })
  }

  run()
  // unref so the interval never keeps the process alive on shutdown.
  setInterval(run, PRICE_STATS_TTL_SECONDS * 1000).unref()
}
