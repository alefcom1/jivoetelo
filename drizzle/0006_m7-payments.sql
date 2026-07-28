CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'unitpay' NOT NULL,
	"external_id" text NOT NULL,
	"user_id" integer,
	"sum" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;