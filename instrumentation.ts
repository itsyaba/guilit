/**
 * Next.js calls register() once per server start, in dev and in `next start`
 * alike. It is the only scheduling hook this deployment has: there is no cron,
 * pg_cron is not in the Postgres image, and the jobs table's only worker is a
 * Python process nothing starts.
 *
 * See lib/price-stats-scheduler.ts for what it schedules and why it is safe.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  // A prerender must never write to the database.
  if (process.env.NEXT_PHASE === "phase-production-build") return

  const { startPriceStatsScheduler } = await import(
    "./lib/price-stats-scheduler"
  )
  startPriceStatsScheduler()
}
