CREATE TABLE IF NOT EXISTS "password_resets" (
  "token_hash" text PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_resets_user"
  ON "password_resets" ("user_id", "created_at");
