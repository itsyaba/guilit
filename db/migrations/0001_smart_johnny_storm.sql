CREATE TYPE "public"."message_kind" AS ENUM('text', 'system', 'payment_request');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'paid', 'failed', 'expired', 'cancelled', 'completed', 'refunded');--> statement-breakpoint
CREATE TABLE "search_parses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"query_hash" text NOT NULL,
	"parser_version" text NOT NULL,
	"normalized_query" text NOT NULL,
	"parsed" jsonb NOT NULL,
	"source" text NOT NULL,
	"latency_ms" integer,
	"hit_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_hit_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_stats" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"category_slug" text,
	"condition" "condition",
	"term" text,
	"raw_sample_size" integer NOT NULL,
	"sample_size" integer NOT NULL,
	"trimmed_count" integer NOT NULL,
	"median_etb" integer NOT NULL,
	"p25_etb" integer NOT NULL,
	"p75_etb" integer NOT NULL,
	"min_etb" integer NOT NULL,
	"max_etb" integer NOT NULL,
	"low_fence_etb" integer NOT NULL,
	"high_fence_etb" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid,
	"kind" "message_kind" DEFAULT 'text' NOT NULL,
	"body" text NOT NULL,
	"amount_etb" integer,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"amount_etb" integer NOT NULL,
	"price_etb_at_reservation" integer,
	"tx_ref" text NOT NULL,
	"provider_ref" text,
	"checkout_url" text,
	"request_message_id" uuid,
	"return_path" text,
	"status" "reservation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"provider_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_tx_ref_unique" UNIQUE("tx_ref")
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "search_parses_hash_version_uidx" ON "search_parses" USING btree ("query_hash","parser_version");--> statement-breakpoint
CREATE INDEX "search_parses_last_hit_at_idx" ON "search_parses" USING btree ("last_hit_at");--> statement-breakpoint
CREATE INDEX "price_stats_scope_idx" ON "price_stats" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "price_stats_category_idx" ON "price_stats" USING btree ("category_slug");--> statement-breakpoint
CREATE INDEX "price_stats_computed_at_idx" ON "price_stats" USING btree ("computed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_listing_buyer_uidx" ON "conversations" USING btree ("listing_id","buyer_id");--> statement-breakpoint
CREATE INDEX "conversations_buyer_last_msg_idx" ON "conversations" USING btree ("buyer_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversations_seller_last_msg_idx" ON "conversations" USING btree ("seller_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversations_listing_id_idx" ON "conversations" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_unread_idx" ON "messages" USING btree ("conversation_id","read_at");--> statement-breakpoint
CREATE INDEX "messages_kind_idx" ON "messages" USING btree ("conversation_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_one_active_per_listing_uidx" ON "reservations" USING btree ("listing_id") WHERE status in ('pending', 'paid');--> statement-breakpoint
CREATE INDEX "reservations_listing_status_idx" ON "reservations" USING btree ("listing_id","status");--> statement-breakpoint
CREATE INDEX "reservations_buyer_id_idx" ON "reservations" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "reservations_seller_id_idx" ON "reservations" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "reservations_expires_at_idx" ON "reservations" USING btree ("expires_at");