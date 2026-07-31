CREATE TABLE IF NOT EXISTS "specialists" (
  "user_id" integer PRIMARY KEY REFERENCES "users"("id") ON DELETE cascade,
  "display_name" text NOT NULL,
  "specialization" text,
  "city" text,
  "about" text,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "approved_at" timestamptz
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "specialist_invites" (
  "code" text PRIMARY KEY,
  "specialist_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "used_by_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "specialist_clients" (
  "id" serial PRIMARY KEY,
  "specialist_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "client_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "share_summary" boolean NOT NULL DEFAULT false,
  "share_diary" boolean NOT NULL DEFAULT false,
  "share_weight" boolean NOT NULL DEFAULT false,
  "accepted_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "specialist_clients_pair"
  ON "specialist_clients" ("specialist_user_id", "client_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialist_clients_by_specialist"
  ON "specialist_clients" ("specialist_user_id", "revoked_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialist_clients_by_client"
  ON "specialist_clients" ("client_user_id", "revoked_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "specialist_access_log" (
  "id" serial PRIMARY KEY,
  "specialist_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "client_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "scope" text NOT NULL,
  "at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "specialist_access_log_by_client"
  ON "specialist_access_log" ("client_user_id", "at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pro_applications" (
  "id" serial PRIMARY KEY,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "specialization" text,
  "city" text,
  "clients_count" text,
  "current_tools" text,
  "comment" text,
  "consent_version" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
