-- Индексы, которых не хватало и до этой функции. Дневник читался по одному
-- дню за раз, и последовательный скан на такой выборке не был заметен; любой
-- разбор за окно в 30–90 дней делает его заметным сразу.
CREATE INDEX IF NOT EXISTS "meals_user_day" ON "meals" ("user_id", "eaten_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meal_items_meal" ON "meal_items" ("meal_id");
--> statement-breakpoint

-- Канонический ключ блюда (lib/dish-key.ts). Колонкой, а не отдельной
-- таблицей: связь была бы один-к-одному, а запись — вдвое.
--
-- Nullable намеренно. NULL здесь означает «ключ ещё не проставлен» — так
-- выглядят все записи, сделанные до этой миграции, пока их не разберёт
-- scripts/backfill-dish-keys.mjs. Отличать их от разобранных нужно: у
-- ненайденного блюда ключ не пустой, а «cat:other», и это разные вещи.
ALTER TABLE "meal_items" ADD COLUMN IF NOT EXISTS "dish_key" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meal_items_dish_key" ON "meal_items" ("dish_key");
