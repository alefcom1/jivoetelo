CREATE TABLE "bot_preferences" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"digest_hour" integer DEFAULT 20 NOT NULL,
	"snoozed_until" timestamp with time zone,
	"last_reminder_on" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscriber_id" integer NOT NULL,
	"letter" integer NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "email_subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"source" text NOT NULL,
	"consent_version" text,
	"unsubscribe_token" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	CONSTRAINT "email_subscribers_email_unique" UNIQUE("email"),
	CONSTRAINT "email_subscribers_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE "photo_inbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"photo_key" text NOT NULL,
	"note" text,
	"taken_on" date NOT NULL,
	"taken_time" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"meal_id" integer
);
--> statement-breakpoint
ALTER TABLE "bot_preferences" ADD CONSTRAINT "bot_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_subscriber_id_email_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."email_subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_inbox" ADD CONSTRAINT "photo_inbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_inbox" ADD CONSTRAINT "photo_inbox_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_deliveries_subscriber_letter" ON "email_deliveries" USING btree ("subscriber_id","letter");--> statement-breakpoint
CREATE INDEX "email_deliveries_due" ON "email_deliveries" USING btree ("sent_at","scheduled_for");--> statement-breakpoint
CREATE INDEX "photo_inbox_user_pending" ON "photo_inbox" USING btree ("user_id","created_at");