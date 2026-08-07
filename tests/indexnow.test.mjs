import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  INDEXNOW_KEY,
  MAX_URLS,
  changedUrls,
  indexNowKeyFile,
  indexNowPayload,
} from "../lib/indexnow.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Главная проверка всего модуля.
 *
 * Ключ и файл-подтверждение — две половины одного целого: поисковик сверяет
 * присланный ключ с содержимым файла на сайте и при расхождении отвечает 403.
 * Разъехаться они могут молча — заявки просто перестанут приниматься, а на
 * сайте ничего не сломается, — поэтому пару держит тест, а не внимательность.
 */
test("ключ IndexNow подтверждён файлом в public с ровно тем же содержимым", () => {
  const file = path.join(ROOT, "public", indexNowKeyFile());
  assert.equal(readFileSync(file, "utf8").trim(), INDEXNOW_KEY);
});

test("ключ похож на ключ: 8–128 знаков из [a-zA-Z0-9-]", () => {
  // Требование протокола. Ключ с пробелом или кириллицей примут молча, а
  // отклонять начнут заявки.
  assert.match(INDEXNOW_KEY, /^[a-zA-Z0-9-]{8,128}$/);
});

test("новая страница попадает в заявку", () => {
  const before = [{ url: "https://jivoetelo.ru/", lastModified: "2026-08-01" }];
  const after = [
    { url: "https://jivoetelo.ru/", lastModified: "2026-08-01" },
    { url: "https://jivoetelo.ru/skolko-kalorij/schi", lastModified: "2026-08-05" },
  ];
  assert.deepEqual(changedUrls(before, after), ["https://jivoetelo.ru/skolko-kalorij/schi"]);
});

test("страница с новой датой правки попадает в заявку", () => {
  const before = [{ url: "https://jivoetelo.ru/produkty/grechka", lastModified: "2026-08-01" }];
  const after = [{ url: "https://jivoetelo.ru/produkty/grechka", lastModified: "2026-08-06" }];
  assert.deepEqual(changedUrls(before, after), ["https://jivoetelo.ru/produkty/grechka"]);
});

test("неизменившиеся страницы не отправляются", () => {
  const entries = [
    { url: "https://jivoetelo.ru/", lastModified: "2026-08-01" },
    { url: "https://jivoetelo.ru/blog", lastModified: "2026-08-05" },
  ];
  assert.deepEqual(changedUrls(entries, entries), []);
});

/**
 * Ради этого случая diff и считается по датам, а не по одному лишь наличию
 * адреса: правка текста существующей страницы — самое частое изменение, и
 * если бы её не замечали, уведомление работало бы только для новых страниц.
 */
test("исчезнувший адрес не отправляется", () => {
  const before = [
    { url: "https://jivoetelo.ru/", lastModified: "2026-08-01" },
    { url: "https://jivoetelo.ru/staraya", lastModified: "2026-08-01" },
  ];
  const after = [{ url: "https://jivoetelo.ru/", lastModified: "2026-08-01" }];
  assert.deepEqual(changedUrls(before, after), []);
});

test("порядок заявки повторяет порядок карты сайта", () => {
  const after = [
    { url: "https://jivoetelo.ru/a", lastModified: "2026-08-06" },
    { url: "https://jivoetelo.ru/b", lastModified: "2026-08-06" },
    { url: "https://jivoetelo.ru/c", lastModified: "2026-08-06" },
  ];
  assert.deepEqual(changedUrls([], after).map((url) => url.at(-1)), ["a", "b", "c"]);
});

test("в теле заявки хост, ключ и адрес файла-подтверждения в корне", () => {
  const payload = indexNowPayload("jivoetelo.ru", ["https://jivoetelo.ru/"]);
  assert.equal(payload.host, "jivoetelo.ru");
  assert.equal(payload.key, INDEXNOW_KEY);
  assert.equal(payload.keyLocation, `https://jivoetelo.ru/${INDEXNOW_KEY}.txt`);
  assert.deepEqual(payload.urlList, ["https://jivoetelo.ru/"]);
});

test("потолок на выкатку меньше каталога, но больше ночного конвейера", async () => {
  // Смысл потолка — отличить «вышли новые страницы» от «поменялось общее».
  // Он теряется, если оказывается либо ниже обычного пополнения, либо выше
  // всего каталога, поэтому сравниваем с настоящими его размерами.
  const [{ DISHES }, { PRODUCTS }, { GLOSSARY }, { ARTICLES }] = await Promise.all([
    import("../lib/dishes.ts"),
    import("../lib/products.ts"),
    import("../lib/glossary.ts"),
    import("../lib/articles.ts"),
  ]);
  const catalog = DISHES.length + PRODUCTS.length + GLOSSARY.length + ARTICLES.length;
  assert.ok(MAX_URLS > 10, "ночной конвейер даёт одну-две страницы за запуск");
  assert.ok(MAX_URLS < catalog, `потолок ${MAX_URLS} должен быть ниже каталога (${catalog})`);
});
