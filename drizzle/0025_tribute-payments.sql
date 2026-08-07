-- Приём оплаты через Tribute.
--
-- Две вещи, которых не хватало таблице `payments` при работе с внешним
-- агентом: чем оплачено (тариф — не то же самое, что сумма: цены меняются, а
-- выданные дни остаются) и как платёж связался с человеком. Второе нужно
-- именно потому, что связь не гарантирована: Tribute — посредник, и
-- покупатель у него не обязан совпадать с нашим аккаунтом.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tariff text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS matched_by text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS applied_at timestamptz;

-- Сырые уведомления платёжного сервиса.
--
-- Отдельная таблица, а не поле в `payments`, по трём причинам:
--
-- 1. Уведомление приходит раньше, чем становится понятно, платёж ли это
--    вообще. Событий у Tribute больше одного вида, и складывать напоминание
--    о продлении в таблицу платежей — значит засорять то, что читают как
--    список денег.
-- 2. Документация Tribute из нашей среды недоступна (403), имена полей
--    восстановлены по вторичным источникам. Сырое тело первого настоящего
--    уведомления и есть спецификация, которой у нас нет.
-- 3. Не прошедшее проверку подписи уведомление хранить всё равно надо —
--    иначе непонятно, почему деньги у Tribute есть, а доступа у человека нет.
CREATE TABLE IF NOT EXISTS payment_events (
  id serial PRIMARY KEY,
  provider text NOT NULL DEFAULT 'tribute',
  -- Прошло ли проверку подписи. Доступ выдаётся только по проверенным.
  verified boolean NOT NULL DEFAULT false,
  event_type text,
  external_id text,
  -- Тело как пришло. jsonb, а не text: по нему сразу можно искать поля.
  raw jsonb,
  -- Заголовки — ради имени того самого заголовка с подписью.
  headers jsonb,
  -- Что с событием сделали: applied | unmatched | ignored | bad_signature.
  outcome text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_events_created ON payment_events (created_at DESC);
