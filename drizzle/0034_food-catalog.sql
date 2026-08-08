-- Каталог продуктов: длинный хвост из внешних источников.
--
-- Выверенный справочник на ~300 позиций остаётся в коде
-- (lib/food-reference.ts) и уезжает в клиентский бандл — оттуда мгновенный
-- поиск без сети. Сюда попадает всё остальное: десятки тысяч позиций, для
-- которых бандл не годится и которые ищутся на сервере.
--
-- Главное отличие от справочника — происхождение у каждой строки.
-- Импортированное число это гипотеза, а не факт: у чужих таблиц одно точное
-- значение неизвестного качества, и взяв его как есть, мы унаследуем чужие
-- ошибки вместе с их ложной точностью. Поэтому здесь хранится, откуда
-- строка и трогали ли её люди (docs/catalog-import.md).
CREATE TABLE IF NOT EXISTS food_catalog (
  id serial PRIMARY KEY,
  name text NOT NULL,
  -- Ключ поиска: имя в нижнем регистре, без ё и знаков препинания. Колонкой,
  -- а не выражением в индексе: normalizeSearchKey живёт в TypeScript, и
  -- функциональный индекс потребовал бы держать ту же нормализацию второй
  -- раз на SQL — две реализации разошлись бы на первой же правке.
  search_key text NOT NULL,
  kcal_per_100 double precision NOT NULL,
  protein_per_100 double precision NOT NULL DEFAULT 0,
  fat_per_100 double precision NOT NULL DEFAULT 0,
  carbs_per_100 double precision NOT NULL DEFAULT 0,
  fiber_per_100 double precision NOT NULL DEFAULT 0,
  -- Типичная порция, г. Ноль — «не знаем»: интерфейс тогда берёт 100.
  portion_g double precision NOT NULL DEFAULT 0,
  -- fic-tables | health-diet | dietagram | calculat | user.
  -- От источника зависит подпись в интерфейсе: атрибуция первоисточника —
  -- условие, на котором мы данными пользуемся, а не украшение.
  source text NOT NULL,
  source_ref text,
  -- Сошлась ли калорийность с БЖУ по Атуотеру. FALSE не выбрасывает строку,
  -- но убирает её из поиска: видно объём проблемы, и человек при этом не
  -- получает заведомо кривое число.
  verified boolean NOT NULL DEFAULT false,
  -- Сколько раз правили люди. Ноль отличает нетронутый импорт от выверенного
  -- использованием — тот же приём, что confirmations у barcodes.
  corrections integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Повторный импорт находит строку по паре «источник + его идентификатор» и
-- обновляет её. Без этого второй прогон удвоил бы каталог.
CREATE UNIQUE INDEX IF NOT EXISTS food_catalog_source_ref ON food_catalog (source, source_ref);

-- Поиск по нормализованному имени.
CREATE INDEX IF NOT EXISTS food_catalog_search ON food_catalog (search_key);
