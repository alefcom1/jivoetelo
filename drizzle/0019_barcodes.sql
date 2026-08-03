-- Своя база штрихкодов.
--
-- Единой открытой базы штрихкодов российских продуктов с составом не
-- существует (docs/research-2026-08.md). Значит, база собирается своя — из
-- того, что вводят люди: отсканировал, не нашлось, ввёл КБЖУ с упаковки —
-- и следующий, кто отсканирует ту же пачку, получит её сразу.
--
-- Код — первичный ключ, а не отдельный id: товар с этим кодом ровно один, и
-- суррогатный ключ позволил бы завести его дважды.
CREATE TABLE IF NOT EXISTS barcodes (
  code text PRIMARY KEY,
  name text NOT NULL,
  kcal_per_100 double precision NOT NULL DEFAULT 0,
  protein_per_100 double precision NOT NULL DEFAULT 0,
  fat_per_100 double precision NOT NULL DEFAULT 0,
  carbs_per_100 double precision NOT NULL DEFAULT 0,
  fiber_per_100 double precision NOT NULL DEFAULT 0,
  -- Вес порции по умолчанию: у пачки творога это 180 г, а не 100. Ноль
  -- означает «не знаем» — тогда подставляем сто грамм, как везде.
  portion_g double precision NOT NULL DEFAULT 0,
  -- Кто завёл. ON DELETE SET NULL: человек уходит, а товар остаётся — он
  -- принадлежит не ему. Само по себе это поле нужно, чтобы было к кому
  -- вернуться, если карточка окажется мусором.
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  -- Сколько раз карточку подтвердили, сохранив по ней еду без правки числа.
  -- Ноль — «завели, но никто больше не пользовался»: такую цифру видно, и
  -- по ней отличается проверенная запись от случайной.
  confirmations integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Название не бывает пустым: карточка без названия — это строка, которую
-- человек увидит как пустое место и не поймёт, что нашлось.
ALTER TABLE barcodes ADD CONSTRAINT barcodes_name_not_blank CHECK (btrim(name) <> '');

-- Поиск по названию: «что у нас вообще есть про творог» — и в подсказках
-- ручного ввода, и чтобы не заводить пятую карточку того же продукта.
CREATE INDEX IF NOT EXISTS barcodes_name ON barcodes (lower(name));
