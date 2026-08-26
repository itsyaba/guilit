CREATE TYPE "public"."condition" AS ENUM('brand_new', 'lightly_used', 'fair');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('queued', 'live', 'hidden', 'removed');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('indexed', 'claimed', 'native');--> statement-breakpoint
CREATE TYPE "public"."trust_level" AS ENUM('new', 'established', 'flagged');--> statement-breakpoint
CREATE TABLE "channels" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"telegram_id" bigint NOT NULL,
	"username" text NOT NULL,
	"title" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_message_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channels_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "raw_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"channel_id" bigint NOT NULL,
	"message_id" bigint NOT NULL,
	"grouped_id" bigint,
	"raw_text" text,
	"media_refs" text[],
	"posted_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extractions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raw_message_id" bigint NOT NULL,
	"prompt_version" text NOT NULL,
	"title_en" text,
	"title_am" text,
	"description_en" text,
	"description_am" text,
	"price_etb" integer,
	"negotiable" boolean,
	"category_slug" text,
	"condition" "condition",
	"location_area" text,
	"location_city" text DEFAULT 'Addis Ababa',
	"phone_raw" text,
	"phone_normalized" text,
	"confidence_score" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"slug" text PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_am" text NOT NULL,
	"parent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" bigint,
	"username" text,
	"phone" text,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"trust_level" "trust_level" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title_en" text NOT NULL,
	"title_am" text,
	"description_en" text,
	"description_am" text,
	"price_etb" integer,
	"lowest_price_etb" integer,
	"negotiable" boolean DEFAULT false NOT NULL,
	"category_slug" text,
	"condition" "condition",
	"location_area" text,
	"location_area_am" text,
	"location_city" text DEFAULT 'Addis Ababa',
	"tier" "tier" DEFAULT 'indexed' NOT NULL,
	"status" "listing_status" DEFAULT 'live' NOT NULL,
	"seller_id" uuid,
	"extraction_confidence" real,
	"seen_in_channels" integer DEFAULT 1 NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce("listings"."title_en", '') || ' ' || coalesce("listings"."title_am", '') || ' ' || coalesce("listings"."description_en", '') || ' ' || coalesce("listings"."location_area", ''))) STORED,
	"embedding" vector(768),
	"posted_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "listing_sources" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"raw_message_id" bigint NOT NULL,
	"price_etb" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"phash" text,
	"width" integer,
	"height" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "images_r2_key_unique" UNIQUE("r2_key")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"reporter_id" uuid,
	"reason" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"rater_id" uuid NOT NULL,
	"listing_id" uuid,
	"score" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"query" jsonb NOT NULL,
	"alerts_on" boolean DEFAULT true NOT NULL,
	"last_alert_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_synonyms" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_term" text NOT NULL,
	"synonym" text NOT NULL,
	"category_slug" text,
	"language" text DEFAULT 'mixed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" uuid,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"edits_before" jsonb,
	"edits_after" jsonb,
	"channel_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "removal_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"claimant_phone" text,
	"claimant_name" text,
	"detail" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raw_messages" ADD CONSTRAINT "raw_messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_raw_message_id_raw_messages_id_fk" FOREIGN KEY ("raw_message_id") REFERENCES "public"."raw_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_categories_slug_fk" FOREIGN KEY ("parent") REFERENCES "public"."categories"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_category_slug_categories_slug_fk" FOREIGN KEY ("category_slug") REFERENCES "public"."categories"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_sources" ADD CONSTRAINT "listing_sources_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_sources" ADD CONSTRAINT "listing_sources_raw_message_id_raw_messages_id_fk" FOREIGN KEY ("raw_message_id") REFERENCES "public"."raw_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_logs" ADD CONSTRAINT "moderation_logs_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_logs" ADD CONSTRAINT "moderation_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_logs" ADD CONSTRAINT "moderation_logs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "removal_requests" ADD CONSTRAINT "removal_requests_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "removal_requests" ADD CONSTRAINT "removal_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "raw_messages_channel_message_uidx" ON "raw_messages" USING btree ("channel_id","message_id");--> statement-breakpoint
CREATE INDEX "raw_messages_processed_at_idx" ON "raw_messages" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "raw_messages_grouped_id_idx" ON "raw_messages" USING btree ("grouped_id");--> statement-breakpoint
CREATE INDEX "extractions_raw_message_id_idx" ON "extractions" USING btree ("raw_message_id");--> statement-breakpoint
CREATE INDEX "extractions_prompt_version_idx" ON "extractions" USING btree ("prompt_version");--> statement-breakpoint
CREATE INDEX "extractions_confidence_idx" ON "extractions" USING btree ("confidence_score");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_telegram_id_idx" ON "users" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "listings_search_vector_gin_idx" ON "listings" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "listings_title_en_trgm_idx" ON "listings" USING gin ("title_en" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "listings_embedding_hnsw_idx" ON "listings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "listings_price_etb_idx" ON "listings" USING btree ("price_etb");--> statement-breakpoint
CREATE INDEX "listings_category_slug_idx" ON "listings" USING btree ("category_slug");--> statement-breakpoint
CREATE INDEX "listings_location_area_idx" ON "listings" USING btree ("location_area");--> statement-breakpoint
CREATE INDEX "listings_status_tier_idx" ON "listings" USING btree ("status","tier");--> statement-breakpoint
CREATE INDEX "listings_posted_at_idx" ON "listings" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "listings_seller_id_idx" ON "listings" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "listings_posted_at_id_idx" ON "listings" USING btree ("posted_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_sources_listing_message_uidx" ON "listing_sources" USING btree ("listing_id","raw_message_id");--> statement-breakpoint
CREATE INDEX "listing_sources_listing_id_idx" ON "listing_sources" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_sources_raw_message_id_idx" ON "listing_sources" USING btree ("raw_message_id");--> statement-breakpoint
CREATE INDEX "images_listing_id_sort_idx" ON "images" USING btree ("listing_id","sort_order");--> statement-breakpoint
CREATE INDEX "images_phash_idx" ON "images" USING btree ("phash");--> statement-breakpoint
CREATE INDEX "jobs_status_run_after_idx" ON "jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "jobs_type_status_idx" ON "jobs" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "reports_listing_id_idx" ON "reports" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_id_idx" ON "reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_seller_rater_listing_uidx" ON "ratings" USING btree ("seller_id","rater_id","listing_id");--> statement-breakpoint
CREATE INDEX "ratings_seller_id_idx" ON "ratings" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "saved_searches_user_id_idx" ON "saved_searches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_searches_alerts_on_idx" ON "saved_searches" USING btree ("alerts_on");--> statement-breakpoint
CREATE UNIQUE INDEX "search_synonyms_canonical_synonym_uidx" ON "search_synonyms" USING btree ("canonical_term","synonym");--> statement-breakpoint
CREATE INDEX "search_synonyms_synonym_idx" ON "search_synonyms" USING btree ("synonym");--> statement-breakpoint
CREATE INDEX "search_synonyms_canonical_idx" ON "search_synonyms" USING btree ("canonical_term");--> statement-breakpoint
CREATE INDEX "otp_codes_listing_id_idx" ON "otp_codes" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "otp_codes_phone_idx" ON "otp_codes" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "rate_limit_hits_key_created_at_idx" ON "rate_limit_hits" USING btree ("key","created_at");--> statement-breakpoint
CREATE INDEX "mod_logs_listing_id_idx" ON "moderation_logs" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "mod_logs_actor_id_idx" ON "moderation_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "mod_logs_action_idx" ON "moderation_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "mod_logs_created_at_idx" ON "moderation_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "removal_requests_listing_id_idx" ON "removal_requests" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "removal_requests_status_idx" ON "removal_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "removal_requests_created_at_idx" ON "removal_requests" USING btree ("created_at");