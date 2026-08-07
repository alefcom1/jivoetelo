-- Состояние бота, видимое из админки.
--
-- Одна строка на весь сервис. Могло бы жить в памяти процесса — и жило, пока
-- не выяснилось, что не может: цикл опроса поднимает instrumentation.ts, а
-- страницу админки рендерит серверный компонент, и Next собирает их в разные
-- бандлы. Модуль состояния попадает в оба, инстанса получается два, и
-- страница читала бы собственную пустую копию, сообщая «бот не запускался»
-- при работающем боте. Диагностика, которая врёт, хуже её отсутствия.
--
-- База — единственное место, которое видят оба графа модулей.
CREATE TABLE IF NOT EXISTS bot_health (
  -- Строка ровно одна, и это проверяет база, а не соглашение в коде.
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  transport text,
  started_at timestamptz,
  last_poll_at timestamptz,
  last_update_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  not_started_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
