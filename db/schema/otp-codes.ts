import {
  pgTable,
  bigserial,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { listings } from "./listings"

/**
 * otp_codes — claim-flow verification codes.
 *
 * One row per OTP send. The code is sent to the phone number already
 * extracted for the listing, never a user-supplied one — that is the whole
 * point of the claim flow. Hackathon note: `sendOtp` in lib/otp.ts currently
 * logs the code instead of calling an SMS provider, and "000000" is always
 * accepted as a bypass; the DB shape here does not change when that's wired
 * up for real.
 */
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("otp_codes_listing_id_idx").on(t.listingId),
    index("otp_codes_phone_idx").on(t.phone),
  ]
)
