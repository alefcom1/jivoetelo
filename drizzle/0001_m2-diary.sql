CREATE TABLE "meal_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"meal_id" integer NOT NULL,
	"name" text NOT NULL,
	"grams" double precision NOT NULL,
	"kcal_per_100" double precision DEFAULT 0 NOT NULL,
	"protein_per_100" double precision DEFAULT 0 NOT NULL,
	"fat_per_100" double precision DEFAULT 0 NOT NULL,
	"carbs_per_100" double precision DEFAULT 0 NOT NULL,
	"fiber_per_100" double precision DEFAULT 0 NOT NULL,
	"confidence" text DEFAULT 'medium' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"eaten_on" date NOT NULL,
	"eaten_time" text NOT NULL,
	"meal_type" text NOT NULL,
	"source_text" text,
	"photo_key" text,
	"analysis" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"show_calories" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;