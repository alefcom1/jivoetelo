-- Недельные и месячные отчёты: настройки и журнал отправок.
--
-- Почему нельзя было переиспользовать email_deliveries. Та таблица привязана
-- к email_subscribers — анонимным подписчикам почтовой серии после
-- калькулятора, у которых нет user_id и может не быть учётной записи вовсе.
-- Кроме того, её обработчик (dispatchDueEmails) при неожиданном содержимом
-- ставит attempts на максимум и навсегда прекращает попытки; для отчёта, где
-- «неожиданное содержимое» — это временно недосчитавшаяся статистика, такое
-- поведение означало бы потерю отчёта без шанса на повтор.

CREATE TABLE IF NOT EXISTS "report_preferences" (
  "user_id" integer PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  -- auto | email | telegram | both | off. Текстом, а не enum: значения
  -- меняются вместе с продуктом, а ALTER TYPE в PostgreSQL не откатывается
  -- внутри транзакции, в которой deploy/migrate.sh выполняет файл.
  "weekly" text NOT NULL DEFAULT 'auto',
  "monthly" text NOT NULL DEFAULT 'auto',
  -- Килограммы в отчёте. Включено по умолчанию: человек, который взвешивается
  -- и ведёт дневник, свой вес и так знает, а отчёт без чисел превращается в
  -- намёк. Выключатель — для тех, кому цифра на весах мешает.
  "weight_numbers" boolean NOT NULL DEFAULT true,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "report_deliveries" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- weekly | monthly
  "kind" text NOT NULL,
  -- Последний день периода: воскресенье для недели, последнее число для
  -- месяца. Именно он, а не дата отправки, определяет тождество отчёта —
  -- отправка может сдвинуться на сутки, отчёт от этого другим не станет.
  "period_end" date NOT NULL,
  -- email | telegram
  "channel" text NOT NULL,
  "claimed_at" timestamp with time zone,
  "attempts" integer NOT NULL DEFAULT 0,
  "sent_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Главная гарантия всей затеи: один отчёт на человека, вид, период и канал —
-- сколько бы раз ни запускался планировщик и сколько бы процессов ни жило
-- одновременно. Вставка идёт через ON CONFLICT DO NOTHING, и выигравший
-- гонку получает строку, а остальные — ничего.
CREATE UNIQUE INDEX IF NOT EXISTS "report_deliveries_once"
  ON "report_deliveries" ("user_id", "kind", "period_end", "channel");
--> statement-breakpoint

-- Выборка «что пора отправить»: неотправленные, по возрастанию срока.
CREATE INDEX IF NOT EXISTS "report_deliveries_due"
  ON "report_deliveries" ("sent_at", "created_at");
