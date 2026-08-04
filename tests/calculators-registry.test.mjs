import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { CALCULATORS, CALCULATOR_GROUPS, calculatorsIn } from "../lib/calculators.ts";

/**
 * Реестр раздела расчётов. На него смотрят хаб, меню и сайтмап — ошибка
 * здесь не роняет сборку, а просто прячет страницу от людей.
 */

test("каждый калькулятор реестра существует как страница", () => {
  for (const item of CALCULATORS) {
    const clean = item.href.replace(/^\/+/, "");
    assert.ok(
      existsSync(new URL(`../app/${clean}/page.tsx`, import.meta.url)),
      `${item.href}: нет app/${clean}/page.tsx`,
    );
  }
});

test("все страницы раздела попали в реестр", async () => {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(new URL("../app/raschet/", import.meta.url), { withFileTypes: true });
  const known = new Set(CALCULATORS.map((item) => item.href));
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const href = `/raschet/${entry.name}`;
    if (!existsSync(new URL(`../app/raschet/${entry.name}/page.tsx`, import.meta.url))) continue;
    assert.ok(known.has(href), `${href} есть в приложении, но не в реестре — его не видно из хаба`);
  }
});

test("каждый калькулятор в сайтмапе", async () => {
  const source = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  for (const item of CALCULATORS) {
    assert.ok(source.includes(`"${item.href}"`), `${item.href} нет в sitemap.ts`);
  }
});

test("адреса уникальны, группы заполнены", () => {
  const hrefs = CALCULATORS.map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "повтор адреса в реестре");
  for (const group of CALCULATOR_GROUPS) {
    assert.ok(calculatorsIn(group).length >= 3, `в группе «${group}» меньше трёх расчётов`);
  }
  assert.equal(
    CALCULATORS.filter((item) => !CALCULATOR_GROUPS.includes(item.group)).length,
    0,
    "калькулятор с группой вне списка не попадёт на хаб",
  );
});

test("подписи карточек влезают и отвечают на вопрос", () => {
  for (const item of CALCULATORS) {
    assert.ok(item.title.length <= 42, `«${item.title}» — длинный заголовок карточки`);
    assert.ok(item.summary.length >= 40, `${item.href}: слишком короткое описание`);
    assert.ok(item.summary.length <= 130, `${item.href}: описание не влезет в карточку`);
  }
});

/**
 * Страницы раздела не должны быть тонкими: калькулятор без текста — это
 * ровно та «ферма калькуляторов», которую поисковики душат.
 */
test("на каждой странице расчёта есть содержательный текст и вопросы", async () => {
  for (const item of CALCULATORS) {
    const clean = item.href.replace(/^\/+/, "");
    const source = await readFile(new URL(`../app/${clean}/page.tsx`, import.meta.url), "utf8");
    // Текст считаем по всей папке страницы: у многошаговых расчётов
    // (`plan`, `kviz`) он живёт в клиентском компоненте, а не в page.tsx.
    const all = await pageText(clean);

    const words = all.match(/[А-Яа-яЁё]{3,}/g) ?? [];
    assert.ok(words.length >= 250, `${item.href}: текста на ${words.length} слов — страница тонкая`);

    assert.ok(source.includes("FAQ_ITEMS") || source.includes("raschet-faq"),
      `${item.href}: нет блока вопросов и ответов`);
    assert.ok(source.includes("webApplicationJsonLd") || source.includes("itemListJsonLd"),
      `${item.href}: нет разметки schema.org`);
    assert.ok(source.includes("breadcrumbsJsonLd"), `${item.href}: нет хлебных крошек в разметке`);
    assert.ok(source.includes("alternates: { canonical:"), `${item.href}: нет canonical`);
  }
});

test("калькуляторы ссылаются друг на друга", async () => {
  // Перелинковка внутри раздела — то, чего нет у одностраничных
  // калькуляторов-конкурентов, и то, что удерживает человека на сайте.
  for (const item of CALCULATORS) {
    if (item.href === "/raschet") continue;
    const clean = item.href.replace(/^\/+/, "");
    const all = await pageText(clean);
    const links = [...all.matchAll(/href="(\/raschet\/[a-z-]+|\/produkty|\/skolko-kalorij|\/register|\/kak-schitaem|\/blog)"/g)];
    assert.ok(links.length >= 2, `${item.href}: меньше двух ссылок на другие страницы сайта`);
  }
});

/** Весь текст страницы: page.tsx плюс её клиентские компоненты. */
async function pageText(clean) {
  const { readdir } = await import("node:fs/promises");
  const dir = new URL(`../app/${clean}/`, import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".tsx"));
  const parts = await Promise.all(files.map((name) => readFile(new URL(name, dir), "utf8")));
  return parts.join("\n");
}
