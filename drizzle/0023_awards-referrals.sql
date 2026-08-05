-- Награды и приглашения.
--
-- ## user_awards
--
-- Строка на взятую награду. Ключ — из lib/awards.ts, там же проверка перед
-- записью: в базу попадает только известное значение.
--
-- Почему таблица, а не массив в users, как у подсказок первых шагов. У
-- подсказок нужно знать только «показано или нет», у награды — когда взята:
-- дата стоит в списке и попадает в карточку, которой делятся. Массив пришлось
-- бы превратить в массив объектов, а это уже таблица, только без индекса.
--
-- Строки не удаляются никогда. Награда, которую можно потерять, наказывает за
-- болезнь и отпуск, и весь смысл считать по неубывающим величинам (все дни с
-- записями, лучшая серия) пропал бы вместе с ней.
CREATE TABLE IF NOT EXISTS "user_awards" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "award_key" text NOT NULL,
  "earned_on" date NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Одна награда на человека. Гонки тут реальны: «Сегодня» открыто в вебе и в
-- Mini App одновременно, оба экрана считают взятое при загрузке.
CREATE UNIQUE INDEX IF NOT EXISTS "user_awards_user_key" ON "user_awards" ("user_id", "award_key");

-- ## Приглашения
--
-- Код в самом пользователе, а не отдельной таблицей: он один на человека и
-- живёт столько же, сколько аккаунт. Пусто до первого нажатия «Позвать друга» —
-- заводить код всем заранее незачем, а миграция по живой таблице тем более.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_code" text;

-- Код уходит в ссылку t.me/<бот>?start=ref_<код>, поэтому обязан быть
-- уникальным. Частичный индекс: NULL у большинства, и обычный UNIQUE тут
-- работал бы, но частичный честнее показывает намерение — уникальны
-- существующие коды, а не отсутствие кода.
CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code" ON "users" ("referral_code") WHERE "referral_code" IS NOT NULL;

-- Кто кого привёл. Ссылка на пользователя, а не копия кода: код может быть
-- перевыпущен, а факт «пришёл от этого человека» — нет. ON DELETE SET NULL,
-- потому что удаление пригласившего не должно уносить приглашённого.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invited_by" integer REFERENCES "users"("id") ON DELETE SET NULL;

-- ## Отложенные приглашения
--
-- Человек проходит по ссылке раньше, чем у него появляется аккаунт: сначала
-- открывается чат с ботом (`/start ref_<код>`), и только потом — Mini App, где
-- заводится запись в users. Между этими двумя событиями приглашение негде
-- хранить, кроме как здесь: users ещё нет, а initData Mini App о ссылке в чат
-- уже ничего не знает.
--
-- Ключ — telegram_user_id, потому что это единственное, что известно про
-- человека на обеих сторонах разрыва.
CREATE TABLE IF NOT EXISTS "pending_invites" (
  "telegram_user_id" text PRIMARY KEY,
  "inviter_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
