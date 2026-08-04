import test from "node:test";
import assert from "node:assert/strict";
import { DISHES } from "../lib/dishes.ts";
import { PRODUCTS } from "../lib/products.ts";
import { GLOSSARY } from "../lib/glossary.ts";
import { ARTICLES } from "../lib/articles.ts";

/**
 * Качество контентных страниц — то, что раньше держалось только на утренней
 * проверке человеком.
 *
 * Ночной конвейер пишет по три страницы за ночь, а проверяет их человек в
 * шесть утра. Тонкая страница, одинаковое с соседом описание, карточка без
 * единой связи — всё это глазами пропускается легко, а стоит дорого:
 * страница из таблицы и двух фраз не ранжируется сама и тянет вниз соседей
 * по кластеру. У калькуляторов такой тест уже есть
 * (`tests/calculators-registry.test.mjs`) и трижды находил то, чего никто не
 * заметил.
 *
 * ## Почему пороги именно такие
 *
 * Они не придуманы, а сняты с того, что уже написано, и поставлены чуть ниже
 * текущего минимума. Это **храповик**: он не даёт станет хуже, чем сегодня, и
 * не объявляет брак задним числом. Числа на сегодня — блюда 54–69 слов,
 * продукты 15–34, словарь 147–186, статьи 296–467.
 *
 * Про статьи стоит сказать отдельно: 296–467 слов — это короткий формат, и
 * измеренное время чтения (2–3 минуты) ему соответствует. Порог в 280 держит
 * сегодняшнее, но новым статьям стоит целиться в 500+: короткая статья
 * конкурирует за запрос с длинной и проигрывает ей при прочих равных.
 *
 * Отсюда честная оговорка: карточки продуктов у нас сейчас **тонкие**, и
 * порог в 14 слов лишь фиксирует это, а не одобряет. Поднять десяток самых
 * бедных — задача ночи ремонта, она записана в `docs/seo-pipeline.md`.
 *
 * ## Почему считаем «свои» слова, а не всю страницу
 *
 * Шаблон добавляет каждой странице раздела одинаковый текст. Для поиска
 * ценность имеет ровно то, чем страница отличается от соседей, — поэтому
 * считаем только те слова, которые пришли из данных этой позиции.
 */

/** Значимые слова: короткие предлоги качества текста не создают. */
function words(text) {
  return (String(text).match(/[А-Яа-яЁё]{3,}/g) ?? []).length;
}

const dishText = (dish) => words([
  dish.summary,
  ...(dish.drivers ?? []),
  ...(dish.variants ?? []).map((v) => `${v.label ?? ""} ${v.note ?? ""}`),
].join(" "));

const productText = (product) => words([
  product.inProduct,
  ...(product.drivers ?? []),
  ...(product.household ?? []).map((h) => h.label ?? ""),
].join(" "));

const glossaryText = (term) => words([
  term.short,
  ...(term.sections ?? []).flatMap((s) => [s.heading ?? "", ...(s.paragraphs ?? [])]),
].join(" "));

/* ===== Блюда ===== */

test("страница блюда не тоньше сегодняшней самой бедной", () => {
  for (const dish of DISHES) {
    const count = dishText(dish);
    assert.ok(count >= 50, `«${dish.name}»: собственного текста на ${count} слов — тоньше всего, что уже написано`);
  }
});

test("у блюда названы причины разброса — это и есть его содержание", () => {
  // Без них страница блюда сводится к таблице чисел, каких в выдаче сотни.
  // Наш ответ на вопрос «почему у вас 380, а у соседей 250» живёт здесь.
  for (const dish of DISHES) {
    assert.ok(dish.drivers?.length >= 3, `«${dish.name}»: меньше трёх причин разброса`);
    for (const driver of dish.drivers) {
      assert.ok(words(driver) >= 3, `«${dish.name}»: причина «${driver}» ничего не объясняет`);
    }
  }
});

test("у блюда есть варианты, и они различаются калорийностью", () => {
  for (const dish of DISHES) {
    assert.ok(dish.variants?.length >= 2, `«${dish.name}»: меньше двух вариантов — диапазону неоткуда взяться`);
    const kcals = dish.variants.map((v) => v.kcal);
    assert.ok(
      new Set(kcals).size > 1,
      `«${dish.name}»: у всех вариантов одна калорийность — это один вариант, записанный несколько раз`,
    );
    // Варианты обязаны укладываться в объявленный диапазон блюда, иначе
    // страница спорит сама с собой.
    const [from, to] = dish.kcal;
    for (const variant of dish.variants) {
      assert.ok(
        variant.kcal >= from && variant.kcal <= to,
        `«${dish.name}»: вариант «${variant.label}» на ${variant.kcal} ккал вне диапазона ${from}–${to}`,
      );
    }
  }
});

/* ===== Каталог продуктов ===== */

test("карточка продукта не тоньше сегодняшней самой бедной", () => {
  // Порог низкий сознательно: он фиксирует сегодняшнее состояние, а не
  // одобряет его. Поднять десяток самых бедных карточек — задача ночи
  // ремонта.
  for (const product of PRODUCTS) {
    const count = productText(product);
    assert.ok(count >= 14, `«${product.name}»: собственного текста на ${count} слов`);
  }
});

test("у продукта есть бытовая мера и причины разброса", () => {
  // Формально проверить «свой угол» нельзя, но можно проверить его
  // носители. Карточка без них — пересказ строки справочника.
  for (const product of PRODUCTS) {
    assert.ok(product.household?.length >= 1, `«${product.name}»: нет бытовых мер`);
    assert.ok(product.drivers?.length >= 2, `«${product.name}»: меньше двух причин разброса`);
  }
});

test("связи продуктов с блюдами ведут на существующие блюда", () => {
  const dishSlugs = new Set(DISHES.map((dish) => dish.slug));
  for (const product of PRODUCTS) {
    for (const slug of product.dishSlugs ?? []) {
      assert.ok(dishSlugs.has(slug), `«${product.name}» ссылается на блюдо «${slug}», которого нет`);
    }
  }
});

test("доля связанных карточек не падает", () => {
  // Сейчас связаны 6 из 16. Это мало: несвязанная карточка достижима только
  // из каталога, и для поиска её почти нет. Храповик держит долю от падения,
  // а поднимать её — работа ночи ремонта.
  const linked = PRODUCTS.filter((p) => (p.dishSlugs ?? []).length > 0).length;
  const share = linked / PRODUCTS.length;
  assert.ok(
    share >= 0.35,
    `связаны с блюдами ${linked} карточек из ${PRODUCTS.length} — доля упала до ${Math.round(share * 100)}%`,
  );
});

/* ===== Глоссарий ===== */

test("статья словаря не тонкая и отвечает на свой вопрос", () => {
  for (const term of GLOSSARY) {
    const count = glossaryText(term);
    assert.ok(count >= 130, `«${term.title}»: текста на ${count} слов — страница тонкая`);
    assert.ok(term.question?.length > 20, `«${term.title}»: не сформулирован вопрос`);
    assert.ok(words(term.short) >= 18, `«${term.title}»: короткий ответ короток даже для короткого`);
    assert.ok((term.sections ?? []).length >= 2, `«${term.title}»: меньше двух разделов`);
  }
});

test("термины словаря связаны между собой", () => {
  const slugs = new Set(GLOSSARY.map((term) => term.slug));
  for (const term of GLOSSARY) {
    for (const related of term.related ?? []) {
      const slug = typeof related === "string" ? related : related?.slug;
      if (typeof slug !== "string") continue;
      const clean = slug.replace(/^\/slovar\//, "");
      if (slug.startsWith("/") && !slug.startsWith("/slovar/")) continue;
      assert.ok(slugs.has(clean), `«${term.title}» ссылается на несуществующий термин «${slug}»`);
    }
  }
});

/* ===== Статьи ===== */

test("статья журнала не тонкая", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const article of ARTICLES) {
    const source = await readFile(
      new URL(`../app/blog/content/${article.slug}.tsx`, import.meta.url),
      "utf8",
    );
    // Грубо снимаем разметку: нужен порядок величины, а не точность.
    const count = words(source.replace(/className="[^"]*"/g, " ").replace(/<[^>]+>/g, " "));
    assert.ok(count >= 280, `«${article.slug}»: текста на ${count} слов — для статьи мало`);
  }
});

/* ===== Общее: описания и имена ===== */

test("описания не повторяются между страницами", () => {
  // Одинаковое описание у двух страниц — заявка поисковику, что они дубли.
  // Карточки продуктов сюда не входят: у них нет описания как поля, `inProduct`
  // это грамматический хвост («в банане»), а не текст для выдачи.
  const all = [
    ...DISHES.map((d) => ({ what: `блюдо «${d.name}»`, text: d.summary })),
    ...GLOSSARY.map((g) => ({ what: `термин «${g.title}»`, text: g.short })),
    ...ARTICLES.map((a) => ({ what: `статья «${a.slug}»`, text: a.description })),
  ];

  const seen = new Map();
  for (const row of all) {
    assert.ok(row.text && row.text.length > 40, `${row.what}: описание пустое или слишком короткое`);
    const key = row.text.trim().toLowerCase().slice(0, 120);
    const owner = seen.get(key);
    assert.equal(owner, undefined, `${row.what} и ${owner} начинаются одинаково — для поиска это дубли`);
    seen.set(key, row.what);
  }
});

test("названия страниц уникальны внутри своего раздела", () => {
  for (const [what, names] of [
    ["блюд", DISHES.map((d) => d.name)],
    ["продуктов", PRODUCTS.map((p) => p.name)],
    ["терминов", GLOSSARY.map((g) => g.title)],
  ]) {
    assert.equal(new Set(names).size, names.length, `повтор среди ${what}`);
  }
});
