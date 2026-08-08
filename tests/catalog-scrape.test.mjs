import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeEntities,
  extractEmbeddedJson,
  extractJsonLd,
  extractLinks,
  extractTables,
  findNutritionTable,
  probePage,
  robotsAllows,
  robotsDisallows,
  stripTags,
  tableToRows,
  extractVerticalRecord,
} from "../lib/catalog-scrape.ts";
import { parseAll, parseNumber } from "../lib/catalog-import.ts";

/** Таблица с настоящей шапкой из `th`. */
const PROPER_TABLE = `
<html><body>
<h1>Калорийность круп</h1>
<table class="calorie-table">
  <tr><th>Продукт</th><th>Ккал</th><th>Белки</th><th>Жиры</th><th>Углеводы</th><th>Клетчатка</th></tr>
  <tr><td>Гречка отварная</td><td>110</td><td>4,2</td><td>1,1</td><td>21,3</td><td>2,7</td></tr>
  <tr><td>Рис отварной</td><td>116</td><td>2,2</td><td>0,5</td><td>25,0</td><td>0,4</td></tr>
</table>
</body></html>`;

/** Шапка обычными ячейками — так свёрстана половина русских каталогов. */
const TD_HEADER_TABLE = `
<table>
  <tr><td>Наименование</td><td>Калорийность</td><td>Белки</td><td>Жиры</td><td>Углеводы</td></tr>
  <tr><td>Творог 5%</td><td>121</td><td>17,2</td><td>5,0</td><td>1,8</td></tr>
</table>`;

test("таблица с шапкой из th разбирается и опознаётся", () => {
  const table = findNutritionTable(PROPER_TABLE);
  assert.ok(table, "таблица не найдена");
  assert.equal(table.rows.length, 2);
  assert.equal(table.columns.name, "Продукт");
  assert.equal(table.columns.kcal, "Ккал");
  assert.equal(table.columns.fiber, "Клетчатка");
  assert.equal(table.usable, true);
});

test("шапка обычными ячейками тоже опознаётся", () => {
  // Ради этого случая заголовки и ищутся по смыслу, а не по тегу th.
  const table = findNutritionTable(TD_HEADER_TABLE);
  assert.ok(table);
  assert.equal(table.columns.name, "Наименование");
  assert.equal(table.columns.kcal, "Калорийность");
  assert.equal(table.rows.length, 1);
});

test("таблица без состава не считается годной", () => {
  const nav = `<table><tr><th>Раздел</th><th>Ссылка</th></tr><tr><td>Крупы</td><td>/krupy</td></tr></table>`;
  assert.equal(findNutritionTable(nav), null);
  assert.equal(extractTables(nav)[0].usable, false);
});

test("из нескольких годных берётся самая длинная", () => {
  // Рядом с основной таблицей на странице часто стоит врезка «похожие».
  const html = PROPER_TABLE + `
    <table>
      <tr><th>Продукт</th><th>Ккал</th><th>Белки</th><th>Жиры</th><th>Углеводы</th></tr>
      <tr><td>Похожее</td><td>100</td><td>1</td><td>1</td><td>1</td></tr>
    </table>`;
  const table = findNutritionTable(html);
  assert.equal(table.rows.length, 2, "выбрана короткая врезка вместо основной таблицы");
});

test("разбор переживает вложенные теги и сущности в ячейках", () => {
  const html = `
  <table>
    <tr><th>Продукт</th><th>Ккал</th><th>Белки</th><th>Жиры</th><th>Углеводы</th></tr>
    <tr><td><a href="/x"><b>Творог</b>, 5&#37;</a></td><td>121</td><td>17,2</td><td>5</td><td>1,8</td></tr>
  </table>`;
  const table = findNutritionTable(html);
  assert.equal(table.rows[0][0], "Творог, 5%");
});

test("строки-разделители отбрасываются", () => {
  const html = `
  <table>
    <tr><th>Продукт</th><th>Ккал</th><th>Белки</th><th>Жиры</th><th>Углеводы</th></tr>
    <tr><td colspan="5">— Крупы —</td></tr>
    <tr><td>Гречка</td><td>110</td><td>4,2</td><td>1,1</td><td>21,3</td></tr>
  </table>`;
  const table = findNutritionTable(html);
  assert.equal(table.rows.length, 1, "подзаголовок попал в данные");
  assert.equal(table.rows[0][0], "Гречка");
});

test("таблица со страницы доезжает до импортёра без ручной правки", () => {
  // Главная проверка связки: то, что снял сборщик, разбирает импортёр теми
  // же подсказками. Если эти два места разойдутся, сломается тихо.
  const table = findNutritionTable(PROPER_TABLE);
  const rows = tableToRows(table);
  const { rows: parsed, report } = parseAll(rows, table.columns, "health-diet");
  assert.equal(report.total, 2);
  assert.equal(report.accepted, 2);
  assert.equal(parsed[0].name, "Гречка отварная");
  assert.equal(parsed[0].kcalPer100, 110);
  assert.equal(parsed[0].verified, true, "верные числа обязаны пройти Атуотер");
});

// ─── Ссылки ────────────────────────────────────────────────────────────────

test("ссылки приводятся к абсолютным, якоря и мусор отброшены", () => {
  const html = `
    <a href="/produkt/1">раз</a>
    <a href="produkt/2">два</a>
    <a href="#top">якорь</a>
    <a href="javascript:void(0)">скрипт</a>
    <a href="mailto:a@b.c">почта</a>
    <a href="https://other.example/x">чужой</a>`;
  const links = extractLinks(html, "https://site.ru/catalog/");
  assert.ok(links.includes("https://site.ru/produkt/1"));
  assert.ok(links.includes("https://site.ru/catalog/produkt/2"));
  assert.ok(!links.some((l) => l.includes("#")));
  assert.ok(!links.some((l) => l.startsWith("javascript")));
  assert.ok(!links.some((l) => l.startsWith("mailto")));
});

test("шаблон отсекает всё, что не ведёт вглубь каталога", () => {
  const html = `<a href="/produkt/1">да</a><a href="/about">нет</a>`;
  const links = extractLinks(html, "https://site.ru/", /\/produkt\//);
  assert.deepEqual(links, ["https://site.ru/produkt/1"]);
});

test("одна страница с разными якорями считается одной", () => {
  const html = `<a href="/p/1#a">a</a><a href="/p/1#b">b</a>`;
  assert.equal(extractLinks(html, "https://site.ru/").length, 1);
});

// ─── Запасные пути ─────────────────────────────────────────────────────────

test("JSON-LD читается, битый не роняет разбор", () => {
  const html = `
    <script type="application/ld+json">{"@type":"Recipe","name":"Борщ"}</script>
    <script type="application/ld+json">{ это не json }</script>`;
  const found = extractJsonLd(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].name, "Борщ");
});

test("встроенное состояние фреймворка читается", () => {
  const html = `<script id="__NEXT_DATA__" type="application/json">{"props":{"n":1}}</script>`;
  const found = extractEmbeddedJson(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].props.n, 1);
});

// ─── robots.txt ────────────────────────────────────────────────────────────

test("robots.txt разбирается, комментарии не мешают", () => {
  const robots = `
# комментарий
User-agent: *
Disallow: /admin
Disallow: /search   # и тут комментарий
Allow: /

User-agent: BadBot
Disallow: /`;
  const rules = robotsDisallows(robots);
  assert.deepEqual(rules, ["/admin", "/search"]);
});

test("запрещённые разделы не обходятся", () => {
  const rules = ["/admin", "/search"];
  assert.equal(robotsAllows("https://site.ru/produkt/1", rules), true);
  assert.equal(robotsAllows("https://site.ru/admin/users", rules), false);
  assert.equal(robotsAllows("https://site.ru/search?q=x", rules), false);
});

test("звёздочка в правиле понимается", () => {
  const rules = ["/*.pdf"];
  assert.equal(robotsAllows("https://site.ru/doc.pdf", rules), false);
  assert.equal(robotsAllows("https://site.ru/produkt/1", rules), true);
});

test("правила только для другого агента нас не касаются", () => {
  const robots = `User-agent: BadBot\nDisallow: /`;
  assert.deepEqual(robotsDisallows(robots), []);
});

// ─── Разведка ──────────────────────────────────────────────────────────────

test("разведка страницы сообщает всё, что нужно для настройки", () => {
  const probe = probePage(PROPER_TABLE + `<a href="/p/1">x</a>`, "https://site.ru/");
  assert.equal(probe.tables, 1);
  assert.equal(probe.usableTables, 1);
  assert.equal(probe.columns.name, "Продукт");
  assert.equal(probe.sampleRows.length, 2);
  assert.equal(probe.links, 1);
});

test("разведка страницы без таблиц не падает и говорит, чего не хватает", () => {
  const probe = probePage("<html><body><p>ничего</p></body></html>", "https://site.ru/");
  assert.equal(probe.tables, 0);
  assert.equal(probe.columns, null);
  assert.deepEqual(probe.sampleRows, []);
});

test("служебное: теги снимаются, сущности раскрываются", () => {
  assert.equal(stripTags("<b>Творог</b>&nbsp;5&#37;"), "Творог 5%");
  assert.equal(decodeEntities("&laquo;Гречка&raquo; &mdash; 110"), "«Гречка» — 110");
});

// ─── Карточка одного продукта ──────────────────────────────────────────────
// У страницы отдельного продукта состав свёрстан наоборот: нутриент в
// строке, а не в шапке. Общий разбор такую таблицу не узнаёт, и без
// отдельного прохода сборщик прошёл бы мимо всех карточек каталога.

const PRODUCT_PAGE = `
<html><head><title>Гречка отварная — калорийность | Сайт</title></head><body>
<h1>Гречка отварная</h1>
<table class="nutrition">
  <tr><th>Показатель</th><th>Значение</th></tr>
  <tr><td>Калорийность</td><td>110 ккал</td></tr>
  <tr><td>Белки</td><td>4,2 г</td></tr>
  <tr><td>Жиры</td><td>1,1 г</td></tr>
  <tr><td>Углеводы</td><td>21,3 г</td></tr>
  <tr><td>Клетчатка</td><td>2,7 г</td></tr>
</table>
</body></html>`;

test("карточка продукта разбирается вертикально", () => {
  const record = extractVerticalRecord(PRODUCT_PAGE);
  assert.ok(record, "карточка не опознана");
  assert.equal(record.name, "Гречка отварная");
  assert.equal(record.values.kcal, "110 ккал");
  assert.equal(record.values.protein, "4,2 г");
  assert.equal(record.values.fiber, "2,7 г");
});

test("единицы в значениях не мешают: их снимает разбор чисел импортёра", () => {
  const record = extractVerticalRecord(PRODUCT_PAGE);
  assert.equal(parseNumber(record.values.kcal), 110);
  assert.equal(parseNumber(record.values.protein), 4.2);
});

test("таблица «на порцию» ниже по странице не затирает состав на 100 г", () => {
  // Типичная ловушка: под основной таблицей идёт вторая, с теми же
  // подписями, но другими числами. Выигрывает первое вхождение.
  const html = PRODUCT_PAGE.replace("</body>", `
    <h2>В порции 180 г</h2>
    <table>
      <tr><td>Калорийность</td><td>198 ккал</td></tr>
      <tr><td>Белки</td><td>7,6 г</td></tr>
    </table></body>`);
  const record = extractVerticalRecord(html);
  assert.equal(record.values.kcal, "110 ккал", "состав подменён порционным");
});

test("список определений тоже читается", () => {
  const html = `<h1>Творог 5%</h1><dl>
    <dt>Калорийность</dt><dd>121 ккал</dd>
    <dt>Белки</dt><dd>17,2 г</dd>
    <dt>Жиры</dt><dd>5 г</dd></dl>`;
  const record = extractVerticalRecord(html);
  assert.equal(record.name, "Творог 5%");
  assert.equal(record.values.kcal, "121 ккал");
});

test("страница без калорийности карточкой не считается", () => {
  // Одинокая строчка «Белки» на странице рецепта — не карточка продукта.
  const html = `<h1>Рецепт</h1><table><tr><td>Белки</td><td>4 г</td></tr></table>`;
  assert.equal(extractVerticalRecord(html), null);
});

test("карточка без заголовка отбрасывается: имя брать неоткуда", () => {
  const html = PRODUCT_PAGE.replace(/<h1>.*?<\/h1>/, "").replace(/<title>.*?<\/title>/, "");
  assert.equal(extractVerticalRecord(html), null);
});

test("имя берётся из title, если h1 нет", () => {
  const html = PRODUCT_PAGE.replace(/<h1>.*?<\/h1>/, "");
  assert.match(extractVerticalRecord(html).name, /Гречка отварная/);
});

test("разведка сообщает про карточку, когда списка на странице нет", () => {
  const probe = probePage(PRODUCT_PAGE, "https://site.ru/p/1");
  assert.equal(probe.columns, null, "список опознан там, где его нет");
  assert.ok(probe.vertical, "карточка не замечена");
  assert.equal(probe.vertical.name, "Гречка отварная");
});

test("на странице со списком карточка не ищется", () => {
  const probe = probePage(PROPER_TABLE, "https://site.ru/catalog/");
  assert.ok(probe.columns, "список должен быть опознан");
  assert.equal(probe.vertical, null);
});
