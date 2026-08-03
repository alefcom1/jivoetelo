-- Фотографии продуктов от читателей для публичного каталога.
--
-- Отдельная таблица, а не флаг на meals: снимок в дневнике и снимок в
-- каталоге различаются целью обработки и правовым основанием. Первый сделан
-- для себя, второй уходит на публичную страницу — это отдельное согласие
-- (user_consents.kind = 'photo_publication').
--
-- Каскад по user_id обязателен: удаление аккаунта должно уносить и вклад в
-- каталог, иначе «необратимое удаление» перестаёт быть необратимым.
CREATE TABLE IF NOT EXISTS "catalog_photos" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "product_slug" text NOT NULL,
  "photo_key" text NOT NULL,
  "caption" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "rejection_reason" text,
  "consent_version" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "catalog_photos" ADD CONSTRAINT "catalog_photos_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Основной запрос страницы: «одобренные снимки этого продукта».
CREATE INDEX IF NOT EXISTS "catalog_photos_slug_status" ON "catalog_photos" ("product_slug","status");
--> statement-breakpoint
-- Нужен при отзыве согласия и при выгрузке данных аккаунта.
CREATE INDEX IF NOT EXISTS "catalog_photos_user" ON "catalog_photos" ("user_id");
