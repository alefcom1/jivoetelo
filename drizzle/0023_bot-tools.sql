-- Инструменты бота: напоминание взвеситься и реферальные ссылки.

-- Напоминание о взвешивании — отдельный переключатель, а не часть вечерних
-- напоминаний. Смешивать нельзя: /stop выключает разговор про еду, и человек,
-- нажавший его, не соглашался на утреннее «встаньте на весы». Своя дата
-- последней отправки нужна по той же причине, что и last_reminder_on:
-- запись даты — это захват права на отправку, а не отчёт о ней.
ALTER TABLE bot_preferences ADD COLUMN IF NOT EXISTS weigh_reminders_enabled boolean NOT NULL DEFAULT TRUE;
ALTER TABLE bot_preferences ADD COLUMN IF NOT EXISTS last_weigh_reminder_on date;

-- Реферальные ссылки. Код выдаётся лениво, при первом запросе, — большинство
-- аккаунтов никого не приглашает, и заводить им код при регистрации незачем.
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text;
-- Кто пригласил. ON DELETE SET NULL, а не CASCADE: удаление пригласившего не
-- повод стирать аккаунт приглашённого — он к тому моменту сам себе хозяин.
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by integer REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code ON users (referral_code);
CREATE INDEX IF NOT EXISTS users_referred_by ON users (referred_by);

-- Переход по чужой ссылке до того, как аккаунт появился.
--
-- Отдельная таблица, а не поле: в момент /start ref_XXXXXX человека в users
-- ещё нет, а пока он дойдёт до регистрации, пройдёт от минуты до недели.
-- Ключ — telegram_user_id, потому что это единственное, что мы о нём знаем.
CREATE TABLE IF NOT EXISTS referral_visits (
  telegram_user_id text PRIMARY KEY,
  referrer_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
