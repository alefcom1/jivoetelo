import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Файл с `"use server"` может экспортировать только асинхронные функции.
 *
 * Это не стилистика: Next проверяет правило в рантайме и валит **всю
 * страницу**, а не отдельный экспорт. Мы поймали это дорого — реэкспорт одной
 * числовой константы из app/reset-actions.ts клал восстановление пароля
 * целиком, и снаружи это выглядело как «страница не загрузилась».
 *
 * Хуже всего, что ни типы, ни линтер, ни сборка ничего не сказали: ошибка
 * появляется только при выполнении, то есть у живого человека.
 *
 * Экспорты типов проверять не нужно — они стираются и до рантайма не
 * доживают. Смотрим только на значения.
 */

const ROOTS = ["app", "lib"];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry.name)) yield full;
  }
}

/** Первая строка файла без учёта пустых строк и комментариев сверху. */
function isServerFile(source) {
  return /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(source);
}

test("в файлах с use server экспортируются только асинхронные функции", async () => {
  const bad = [];
  for (const root of ROOTS) {
    for await (const file of walk(root)) {
      const source = await readFile(file, "utf8");
      if (!isServerFile(source)) continue;

      for (const match of source.matchAll(/^export\s+(.+)$/gm)) {
        const rest = match[1].trim();
        // Типы стираются на сборке — до правила Next они не доходят.
        if (rest.startsWith("type ") || rest.startsWith("interface ")) continue;
        if (/^async function /.test(rest)) continue;
        // `export { … }` — реэкспорт значений; ровно та ошибка, что была.
        bad.push(`${file}: export ${rest.slice(0, 60)}`);
      }
    }
  }
  assert.deepEqual(bad, [], `не асинхронные экспорты в "use server":\n${bad.join("\n")}`);
});

test("нижняя граница пароля в форме совпадает с той, по которой проверяет сервер", async () => {
  // Форма объявляет своё число, а не импортирует общее: lib/password-reset.ts
  // тянет node:crypto, и в клиентском компоненте ему делать нечего. Цена
  // такого решения — два места вместо одного, поэтому их сверяет тест.
  const lib = await readFile("lib/password-reset.ts", "utf8");
  const form = await readFile("app/reset/reset-forms.tsx", "utf8");
  const fromLib = lib.match(/export const MIN_PASSWORD_LENGTH = (\d+)/)?.[1];
  const fromForm = form.match(/const MIN_PASSWORD_LENGTH = (\d+)/)?.[1];
  assert.ok(fromLib, "в lib/password-reset.ts не нашлась MIN_PASSWORD_LENGTH");
  assert.ok(fromForm, "в форме не нашлась MIN_PASSWORD_LENGTH");
  assert.equal(fromForm, fromLib, "форма обещает одну длину, а сервер проверяет другую");
});
