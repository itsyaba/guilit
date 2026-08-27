CREATE TABLE "login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce" text NOT NULL,
	"verifier_hash" text NOT NULL,
	"telegram_id" bigint,
	"user_id" uuid,
	"approved_at" timestamp with time zone,
	"next_path" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_tokens_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_tokens_expires_at_idx" ON "login_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "login_tokens_user_id_idx" ON "login_tokens" USING btree ("user_id");