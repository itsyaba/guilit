import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set")
}

/**
 * In Next.js dev mode the module can be re-evaluated on every HMR cycle.
 * Storing the connection on globalThis prevents exhausting the connection pool.
 */
const globalForDb = globalThis as unknown as { conn: postgres.Sql | undefined }

const conn =
  globalForDb.conn ??
  postgres(process.env.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
  })

if (process.env.NODE_ENV !== "production") globalForDb.conn = conn

export const db = drizzle(conn, { schema })
