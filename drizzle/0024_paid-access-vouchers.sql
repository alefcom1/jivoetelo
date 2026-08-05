-- Платный доступ, ваучеры и журнал обращений администратора.

-- ## Доступ сроком, а не флагом
--
-- Источников платного доступа два — оплата и ваучер, — и будет больше, а
-- вопрос к ним всегда один: открыт ли доступ прямо сейчас. Флаг «premium: да»
-- пришлось бы снимать по расписанию, и первый же упавший cron оставил бы
-- доступ тем, кто за него не платил, — или снял бы у тех, кто заплатил.
--
-- Поэтому здесь дата, а users.plan становится вычисляемым (lib/paid.ts) и
-- больше нигде не пишется. Саму колонку не трогаем: она проставлена всем в
-- 'free', читается старым кодом и ничему не мешает.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "access_until" timestamptz;

-- ## Ваучеры
--
-- Код на бесплатный доступ: выдаётся администратором вручную или начисляется
-- за приглашение. Строка живёт вечно и после погашения — по ней отвечают на
-- вопрос «кому и когда мы это выдали», а он возникает не в день выдачи.
CREATE TABLE IF NOT EXISTS "vouchers" (
  "id" serial PRIMARY KEY,
  -- Канонический вид: заглавные, без дефиса (lib/vouchers.ts, normalizeCode).
  "code" text NOT NULL UNIQUE,
  -- На сколько дней продлевает. Днями, а не тарифом: тариф может подорожать
  -- или исчезнуть, а обещание «месяц» уже роздано.
  "days" integer NOT NULL,
  -- Кто выдал. NULL — начислено автоматически за приглашение.
  "issued_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  -- Кому предназначен, если известно заранее (награда за приглашение).
  "issued_to" integer REFERENCES "users"("id") ON DELETE SET NULL,
  -- Пометка для себя: «блогеру такому-то», «компенсация за сбой».
  "note" text,
  -- До какого момента код можно погасить. NULL — бессрочно.
  "expires_at" timestamptz,
  "used_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Поиск непогашенных по владельцу — для экрана «мои ваучеры» и начислений.
CREATE INDEX IF NOT EXISTS "vouchers_issued_to" ON "vouchers" ("issued_to") WHERE "used_at" IS NULL;

-- ## Журнал обращений администратора
--
-- Доступ к данным полный — так решено. Журнал его не ограничивает, а
-- записывает: при жалобе или проверке спрашивают именно «кто и когда смотрел»,
-- и отвечать на это надо записью, а не по памяти.
--
-- Пишется только просмотр персональных данных конкретного человека. Сводные
-- цифры сюда не идут: в них нет ничьего дневника, и запись о каждом открытии
-- главной страницы админки сделала бы журнал нечитаемым.
CREATE TABLE IF NOT EXISTS "admin_access_log" (
  "id" serial PRIMARY KEY,
  "admin_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Чьи данные смотрели. ON DELETE SET NULL: удаление аккаунта не должно
  -- стирать запись о том, что к нему обращались.
  "subject_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  -- Что именно смотрели: 'profile', 'diary', 'photos'.
  "scope" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "admin_access_log_subject" ON "admin_access_log" ("subject_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "admin_access_log_admin" ON "admin_access_log" ("admin_id", "created_at" DESC);

-- ## Комментарий модератора к снимку
--
-- Причина отказа уже есть (rejection_reason) — но она пишется автору. Нужна
-- и вторая, внутренняя: «лицо в отражении», «дубль вчерашнего». Их нельзя
-- держать в одном поле: первое человек прочитает, второе не должен.
ALTER TABLE "catalog_photos" ADD COLUMN IF NOT EXISTS "moderator_note" text;

-- Отправлено ли решение автору. NULL — не отправляли (старые строки и те,
-- где отправка не удалась): без этого признака повторный разбор очереди
-- слал бы одно и то же письмо дважды.
ALTER TABLE "catalog_photos" ADD COLUMN IF NOT EXISTS "notified_at" timestamptz;

-- ## Награда за приглашение
--
-- Месяц доступа обоим — пригласившему и приглашённому, — когда приглашённый
-- доведёт дневник до седьмого дня. Не в день регистрации: иначе это способ
-- накрутить доступ ботами, а не привести живого человека.
--
-- Отметка стоит у ПРИГЛАШЁННОГО, а не у пригласившего: у первого она одна на
-- всю жизнь, у второго их было бы столько, сколько друзей. Условие
-- `IS NULL` в WHERE делает начисление ровно однократным даже при двух
-- одновременных загрузках экрана.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_rewarded_at" timestamptz;
