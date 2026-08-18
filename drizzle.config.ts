import { defineConfig } from "drizzle-kit"
import { config } from "dotenv"

config({ path: ".env.local" })
config({ path: ".env" })

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://guilit:guilit@localhost:5432/guilit",
  },
})

