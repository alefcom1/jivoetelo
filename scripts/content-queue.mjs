#!/usr/bin/env node
/**
 * Следующая позиция очереди ночного конвейера.
 *
 * Очередь живёт в `docs/seo-pipeline.md` списком задач Markdown и правится
 * руками — это сознательно: она же и документ для человека, и вычёркивать
 * строку глазами проще, чем править конфиг. Отсюда задача скрипта — прочитать
 * этот список так же, как его читает человек.
 *
 * Что здесь важно и неочевидно:
 *
 * 1. **Строки с пометкой «НЕ брать» пропускаются.** В очереди есть позиции,
 *    оставленные как предупреждение будущему себе (например, «Сырники в
 *    духовке — НЕ брать: каннибализирует существующие "Сырники"»). Взять
 *    такую — значит своими руками сделать то, от чего строка предостерегает.
 * 2. **Раздел определяет вид работы.** Блюдо, статья глоссария и методология
 *    пишутся по-разному и ложатся в разные файлы, поэтому раздел едет вместе
 *    с заголовком.
 * 3. **Slug транслитерируется здесь, а не агентом.** Из него получается имя
 *    ветки; пусть оно будет предсказуемым и одинаковым от запуска к запуску.
 *
 * Использование:
 *   node scripts/content-queue.mjs          # JSON следующей позиции
 *   node scripts/content-queue.mjs --count  # сколько всего осталось
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = path.join(HERE, "..", "docs", "seo-pipeline.md");

/** Раздел очереди → что агент должен произвести. */
const SECTION_KINDS = {
  "Блюда — вторая волна": "dish",
  "Глоссарий": "glossary",
  "Методология": "methodology",
};

const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(title) {
  return [...title.toLowerCase()]
    .map((char) => (char in TRANSLIT ? TRANSLIT[char] : /[a-z0-9]/.test(char) ? char : " "))
    .join("")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/**
 * Разбирает очередь. Возвращает все невыполненные позиции по порядку —
 * порядок задан частотностью запросов, и агент берёт первую.
 */
export function parseQueue(markdown) {
  const items = [];
  let section = null;

  for (const line of markdown.split("\n")) {
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      section = heading[1];
      continue;
    }

    const task = line.match(/^-\s+\[( |x)\]\s+(.+?)\s*$/);
    if (!task || !section) continue;

    const done = task[1] === "x";
    const title = task[2];

    // Пометка-предупреждение: позиция намеренно оставлена в списке, чтобы
    // никто не завёл её заново, — но брать её нельзя.
    if (/НЕ брать/i.test(title)) continue;
    if (done) continue;

    const kind = SECTION_KINDS[section];
    if (!kind) continue;

    items.push({ kind, section, title, slug: slugify(title) });
  }

  return items;
}

function main() {
  const markdown = readFileSync(QUEUE_FILE, "utf8");
  const items = parseQueue(markdown);

  if (process.argv.includes("--count")) {
    console.log(String(items.length));
    return;
  }

  const next = items[0];
  if (!next) {
    // Пустая очередь — не ошибка: это значит, что всё написано. Workflow
    // читает `empty` и завершается без запуска агента.
    console.log(JSON.stringify({ empty: true }));
    return;
  }

  console.log(JSON.stringify({ empty: false, remaining: items.length, ...next }));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
