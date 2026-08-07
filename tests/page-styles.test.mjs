import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Страница использует класс — значит, его стили до неё доезжают.
 *
 * Проверка написана по факту двух одинаковых поломок. Сначала с главной
 * пропали стили блока «Цена»: правило `.price` сочли осиротевшим и удалили,
 * а разметка осталась — текст поехал к левому краю, и заметили это только по
 * присланному снимку экрана. Потом ровно то же чуть не случилось с новой
 * страницей `/tarify`: она размечена классами расчётов (`.raschet-page`), а
 * они живут не в globals.css, а в app/raschet/raschet.css, который нужно
 * импортировать в свой layout. Без импорта страница открывается голым
 * потоком абзацев — и сборка на это не жалуется, потому что формально всё
 * верно.
 *
 * Разница между «класса нет в CSS» и «CSS не подключён» здесь не важна:
 * снаружи оба выглядят одинаково — как сломанная вёрстка.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(ROOT, "app");

/** Классы, чьи стили лежат не в globals.css, и файл, где они на самом деле. */
const SCOPED = [
  { marker: "raschet-page", css: "app/raschet/raschet.css" },
  { marker: "raschet-shell", css: "app/raschet/raschet.css" },
];

async function pageFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await pageFiles(full)));
    else if (entry.name === "page.tsx") found.push(full);
  }
  return found;
}

/**
 * Доезжает ли до страницы указанный css: смотрим её layout и все layout выше
 * по дереву — Next применяет их вложенно, и импорт в родительском работает
 * для всех детей.
 */
async function cssReaches(pageFile, cssPath) {
  let dir = path.dirname(pageFile);
  const target = path.basename(cssPath);
  while (dir.startsWith(APP)) {
    const layout = path.join(dir, "layout.tsx");
    if (existsSync(layout)) {
      const text = await readFile(layout, "utf8");
      if (text.includes(target)) return true;
    }
    dir = path.dirname(dir);
  }
  return false;
}

test("страница с классами расчётов подключает их стили", async () => {
  const pages = await pageFiles(APP);
  assert.ok(pages.length > 20, "страниц найдено подозрительно мало — проверка ничего не проверяет");

  for (const file of pages) {
    const markup = await readFile(file, "utf8");
    for (const { marker, css } of SCOPED) {
      if (!markup.includes(`"${marker}"`) && !markup.includes(`${marker} `)) continue;
      assert.ok(
        await cssReaches(file, css),
        `${path.relative(ROOT, file)} размечена классом «${marker}», но ${css} до неё не доезжает — `
          + "добавьте импорт в layout.tsx рядом со страницей",
      );
    }
  }
});

test("классы, добавленные для оплаты, описаны в CSS", async () => {
  // Обратная сторона той же ошибки: разметка есть, правила нет. Проверяем
  // именно новые классы — сплошную сверку всех классов сайта такой тест не
  // потянет, а эти три появились вместе с кнопками оплаты.
  const globals = await readFile(path.join(APP, "globals.css"), "utf8");
  const tg = await readFile(path.join(APP, "tg", "tg.css"), "utf8");

  for (const name of ["access-error", "tarify-block", "pay-links", "access-note"]) {
    assert.match(globals, new RegExp(`\\.${name}[\\s{,:.]`), `в globals.css нет правила .${name}`);
  }
  assert.match(tg, /\.tg-access-error[\s{,:.]/, "в tg.css нет правила .tg-access-error");
});
