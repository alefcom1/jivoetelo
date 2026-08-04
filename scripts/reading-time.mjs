#!/usr/bin/env node
/**
 * Измеряет время чтения статей журнала по факту — и сверяет с реестром.
 *
 *   node scripts/reading-time.mjs          # проверить (падает при расхождении)
 *   node scripts/reading-time.mjs --write  # переписать minutes в lib/articles.ts
 *
 * Требует поднятой сборки на 127.0.0.1:3111 (см. docs/handover.md).
 *
 * ## Зачем скрипт, а не число из головы
 *
 * Первая версия реестра несла `minutes`, проставленные на глаз: 6–9 минут
 * там, где текста на 2–3. Это мелкое, но настоящее враньё читателю — и
 * ровно того сорта, против которого написаны сами статьи. Считать нужно по
 * тексту, а не по ощущению от объёма файла.
 *
 * ## Как считаем
 *
 * Слова берём из отрендеренной страницы, а не из исходника: в .tsx намешаны
 * теги, атрибуты и данные таблиц, и любой разбор исходника — гадание.
 * В расчёт идут лид и разделы статьи; «кто это написал», «читайте также» и
 * призыв не считаются — их не читают подряд с текстом.
 *
 * 180 слов в минуту — нижняя граница обычного темпа чтения нон-фикшн на
 * русском (обиходные оценки — 180–220). Берём нижнюю: лучше пообещать
 * больше времени, чем меньше.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { launchBrowser } from "../tests/e2e/browser.mjs";
import { ARTICLES } from "../lib/articles.ts";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3111";
const WORDS_PER_MINUTE = 180;
const write = process.argv.includes("--write");

/** Минимум — две минуты: «1 мин чтения» выглядит как заметка, а не статья. */
function minutesFor(words) {
  return Math.max(2, Math.round(words / WORDS_PER_MINUTE));
}

const browser = await launchBrowser();
const measured = [];
try {
  const page = await browser.newPage();
  for (const article of ARTICLES) {
    await page.goto(`${BASE}/blog/${article.slug}`, { waitUntil: "networkidle", timeout: 30000 });
    const words = await page.evaluate(() => {
      const parts = [document.querySelector(".blog-article-lead")?.textContent ?? ""];
      for (const section of document.querySelectorAll(".blog-article > section")) {
        if (section.classList.contains("blog-related")) continue;
        if (section.classList.contains("blog-byline")) continue;
        parts.push(section.textContent ?? "");
      }
      return parts.join(" ").trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    });
    measured.push({ slug: article.slug, words, minutes: minutesFor(words), claimed: article.minutes });
  }
} finally {
  await browser.close();
}

for (const row of measured) {
  const mark = row.minutes === row.claimed ? "ok  " : "РАЗОШЛОСЬ";
  console.log(`  ${mark} ${row.slug.padEnd(46)} ${String(row.words).padStart(4)} слов → ${row.minutes} мин (в реестре ${row.claimed})`);
}

const wrong = measured.filter((row) => row.minutes !== row.claimed);

if (write && wrong.length) {
  const file = resolve(import.meta.dirname, "../lib/articles.ts");
  let source = await readFile(file, "utf8");
  for (const row of wrong) {
    const at = source.indexOf(`slug: "${row.slug}"`);
    const minutesAt = source.indexOf("    minutes:", at);
    const lineEnd = source.indexOf("\n", minutesAt);
    source = source.slice(0, minutesAt) + `    minutes: ${row.minutes},` + source.slice(lineEnd);
  }
  await writeFile(file, source);
  console.log(`\nОбновлено в реестре: ${wrong.length}`);
  process.exit(0);
}

if (wrong.length) {
  console.log(`\nВремя чтения разошлось с текстом у ${wrong.length} статей.`);
  console.log("Поправить: node scripts/reading-time.mjs --write");
  process.exit(1);
}
console.log("\nВремя чтения совпадает с текстом.");
