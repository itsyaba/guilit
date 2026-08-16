import {
  pgTable,
  bigserial,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { jobStatusEnum } from "./enums"

/**
 * jobs — Postgres-native job queue.
 *
 * No Redis. SELECT ... FOR UPDATE SKIP LOCKED provides the same mutual
 * exclusion guarantee without an extra service in the deployment. At our
 * volume this is strictly better: one fewer container to manage, one fewer
 * failure domain, and the job state is queryable with plain SQL.
 *
 * Worker flow:
 *   1. BEGIN
 *   2. SELECT id FROM jobs WHERE status = 'pending'
 *        AND run_after <= NOW()
 *        ORDER BY run_after
 *        LIMIT 1
 *        FOR UPDATE SKIP LOCKED
 *   3. UPDATE jobs SET status = 'running', locked_at = NOW(), locked_by = $worker
 *   4. COMMIT  ← other workers can now see the lock
 *   5. Do work
 *   6. UPDATE jobs SET status = 'done'   (or 'failed', attempts++)
 *
 * run_after enables delayed jobs and exponential backoff: on failure set
 * run_after = NOW() + interval '2^attempts minutes', status = 'pending'.
 * On Gemini 429 the job stays pending rather than failing, so the daily-cap
 * reset is transparent to the pipeline.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: text("type").notNull(), // e.g. 'extract', 'embed', 'dedup', 'alert'
    payload: jsonb("payload"),
    status: jobStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: timestamp("run_after", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }), // null = available
    lockedBy: text("locked_by"), // worker process identifier
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The index the worker SELECT hits on every poll
    index("jobs_status_run_after_idx").on(t.status, t.runAfter),
    index("jobs_type_status_idx").on(t.type, t.status),
  ]
)
