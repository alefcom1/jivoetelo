#!/usr/bin/env node
/**
 * Сбор каталога продуктов с сайта-источника.
 *
 * **Запускать на VPS, а не из среды разработки.** Здесь сеть закрыта
 * политикой egress — все внешние адреса получают 403 на CONNECT, включая
 * источники, на которые есть разрешение. Тот же случай, что у
 * scripts/off-probe.mjs.
 *
 * Разрешения правообладателей на источники получены; условия и границы — в
 * docs/content-programme.md. Разрешение не отменяет вежливости: скрипт
 * читает robots.txt, держит паузу между запросами и умеет продолжать с
 * места обрыва, чтобы не ходить по одному и тому же дважды.
 *
 * ## Порядок работы
 *
 * Сначала разведка одной страницы — она отвечает, годится ли общий разбор:
 *
 *   node scripts/collect-catalog.mjs --probe https://example.ru/catalog/krupy
 *
 * Разведка печатает, сколько таблиц на странице, опознались ли колонки, что
 * в первых строках и сколько ссылок ведёт вглубь. Если колонки опознаны —
 * можно собирать, ничего не дописывая.
 *
 *   node scripts/collect-catalog.mjs \
 *     --source health-diet \
 *     --seed https://example.ru/catalog/ \
 *     --link-pattern '/catalog/' \
 *     --out data/health-diet.csv
 *
 * Результат — CSV, который без правки понимает scripts/import-catalog.mjs.
 *
 * ## Ключи
 *
 *   --probe URL        разведка одной страницы, ничего не сохраняет
 *   --source KEY       источник из lib/catalog-sources.ts
 *   --seed URL         откуда начинать обход
 *   --link-pattern RE  какие ссылки считать «вглубь каталога»
 *   --out FILE         куда писать CSV
 *   --delay MS         пауза между запросами (по умолчанию 1500)
 *   --max N            предел страниц за прогон
 *   --state FILE       файл прогресса (по умолчанию <out>.state.json)
 *   --ignore-robots    только если владелец прямо разрешил обход закрытых разделов
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Разбор и источники лежат в `.ts`, и грузим мы их **динамически**, а не
 * обычным import сверху. Причина не в стиле: статические импорты
 * поднимаются выше любого кода, и на старом Node падение случилось бы
 * раньше, чем успела бы выполниться проверка версии. Человек получил бы
 * MODULE_NOT_FOUND без единого намёка на настоящую причину — так уже
 * случилось на боевом сервере с Node 20.
 */
let extractLinks, extractVerticalRecord, findNutritionTable, probePage;
let robotsAllows, robotsDisallows, tableToRows, CATALOG_SOURCES, isCatalogSource;

/** Подсказка, когда среда не умеет исполнять TypeScript. */
function explainNoTypeScript(script) {
  console.error("Не удалось загрузить .ts-модули: эта среда не исполняет TypeScript.");
  console.error(`Node здесь ${process.versions.node}; сам, без сборки, он умеет это с 22.6.`);
  console.error("");
  console.error("Два пути:");
  console.error(`  1. Запустить через tsx:  npx --yes tsx scripts/${script} ...`);
  console.error("  2. Обновить Node до 22.6+ (проекту всё равно нужен >=22.13).");
  process.exit(1);
}

/**
 * Ошибка именно про «не умею .ts», а не про поломку внутри модуля.
 * Различать обязательно: иначе настоящая ошибка в коде выдавалась бы за
 * старый Node, и чинили бы не то.
 */
function isTypeScriptUnsupported(error) {
  return error?.code === "ERR_UNKNOWN_FILE_EXTENSION"
    || error?.code === "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING"
    || (error?.code === "ERR_MODULE_NOT_FOUND" && /\.ts/.test(error.message ?? ""));
}

async function loadModules() {
  try {
    const scrape = await import("../lib/catalog-scrape.ts");
    const sources = await import("../lib/catalog-sources.ts");
    ({ extractLinks, extractVerticalRecord, findNutritionTable, probePage, robotsAllows, robotsDisallows, tableToRows } = scrape);
    ({ CATALOG_SOURCES, isCatalogSource } = sources);
  } catch (error) {
    if (isTypeScriptUnsupported(error)) explainNoTypeScript("collect-catalog.mjs");
    throw error;
  }
}

/**
 * Представляемся честно. Владелец, увидев это в логах, должен понять, кто
 * пришёл и к кому идти с вопросами, — а не гадать про очередного робота.
 *
 * Только латиница: заголовки HTTP — ByteString, и кириллица в них роняет
 * каждый запрос ещё до отправки. Проверено на живом прогоне: с русским
 * текстом внутри сборщик не делает ни одного запроса вообще.
 */
const USER_AGENT = "jivoetelo-catalog/1.0 (+https://jivoetelo.ru; authorized by site owner)";

/** Пауза между запросами по умолчанию. Полторы секунды — не гонка. */
const DEFAULT_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 3;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else { args[key] = next; i += 1; }
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Запрос с повтором и отступом.
 *
 * 429 и 5xx — повод подождать и попробовать снова, а не падать: на длинном
 * обходе они случаются у любого сайта. 404 повтора не заслуживает.
 */
async function fetchPage(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) return { ok: false, status: 404, html: "" };
    if ((response.status === 429 || response.status >= 500) && attempt <= MAX_RETRIES) {
      const wait = 2000 * 2 ** (attempt - 1);
      console.error(`  ${response.status} на ${url} — жду ${wait} мс и повторяю`);
      await sleep(wait);
      return fetchPage(url, attempt + 1);
    }
    if (!response.ok) return { ok: false, status: response.status, html: "" };
    return { ok: true, status: response.status, html: await response.text() };
  } catch (error) {
    if (attempt <= MAX_RETRIES) {
      const wait = 2000 * 2 ** (attempt - 1);
      console.error(`  сбой сети на ${url} (${error.message}) — жду ${wait} мс`);
      await sleep(wait);
      return fetchPage(url, attempt + 1);
    }
    return { ok: false, status: 0, html: "" };
  }
}

/**
 * Правила из robots.txt или `null`, если файл не удалось прочитать.
 *
 * Разница между «ограничений нет» и «не смог проверить» существенная, и
 * поэтому здесь `null`, а не пустой массив: сборщик, молча выдающий сбой
 * сети за разрешение обходить всё, — ровно то, чего мы не хотим. Отсутствие
 * robots.txt (404) — это законное «ограничений нет», а сетевой сбой — нет.
 */
async function loadRobots(origin) {
  const result = await fetchPage(new URL("/robots.txt", origin).toString());
  if (result.status === 404) return [];
  if (!result.ok) return null;
  return robotsDisallows(result.html, "jivoetelo-catalog");
}

/** CSV с экранированием: в названиях продуктов запятые и кавычки — норма. */
function toCsvLine(values) {
  return values
    .map((value) => {
      const text = String(value ?? "");
      return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(",");
}

const OUT_HEADER = ["Название", "Ккал", "Белки", "Жиры", "Углеводы", "Клетчатка", "Порция", "ID"];

function loadState(file) {
  if (!existsSync(file)) return { visited: [], queued: [], written: 0 };
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    console.error(`Файл прогресса ${file} повреждён — начинаю сначала.`);
    return { visited: [], queued: [], written: 0 };
  }
}

function saveState(file, state) {
  writeFileSync(file, JSON.stringify(state, null, 2));
}

async function runProbe(url) {
  console.log(`Разведка: ${url}`);
  const origin = new URL(url).origin;
  const disallows = await loadRobots(origin);
  if (disallows === null) {
    console.log("robots.txt: прочитать не удалось — проверьте сеть, прежде чем запускать сбор");
  } else {
    console.log(`robots.txt: ${disallows.length === 0 ? "ограничений нет" : disallows.join(", ")}`);
    console.log(`этот адрес обходить ${robotsAllows(url, disallows) ? "можно" : "НЕЛЬЗЯ"}`);
  }

  const result = await fetchPage(url);
  if (!result.ok) {
    console.error(`Не получилось загрузить: HTTP ${result.status}`);
    process.exit(1);
  }

  const probe = probePage(result.html, url);
  console.log("");
  console.log(`Таблиц на странице:     ${probe.tables}`);
  console.log(`Из них с составом:      ${probe.usableTables}`);
  console.log(`Ссылок:                 ${probe.links}`);
  console.log(`JSON-LD / встроенный:   ${probe.jsonLd} / ${probe.embeddedJson}`);

  if (probe.columns) {
    console.log("");
    console.log("Колонки опознаны:");
    for (const [field, header] of Object.entries(probe.columns)) console.log(`  ${field} → «${header}»`);
    console.log("");
    console.log("Первые строки:");
    for (const row of probe.sampleRows) console.log(`  ${row.join(" | ")}`);
    console.log("");
    console.log("Общего разбора достаточно — можно запускать сбор.");
  } else if (probe.vertical) {
    console.log("");
    console.log("Это карточка одного продукта, состав снят вертикально:");
    console.log(`  название: ${probe.vertical.name}`);
    for (const [field, value] of Object.entries(probe.vertical.values)) console.log(`  ${field}: ${value}`);
    console.log("");
    console.log("Общего разбора достаточно — можно запускать сбор по карточкам.");
  } else {
    console.log("");
    console.log("Ни списка, ни карточки продукта опознать не удалось.");
    if (probe.headers.length > 0) {
      console.log("Заголовки найденных таблиц:");
      for (const headers of probe.headers) console.log(`  ${headers.join(" | ")}`);
    }
    console.log("");
    console.log("Дальше нужен разбор под этот источник. Пришлите вывод этой разведки");
    console.log("и кусок HTML со страницей — по ним пишется адаптер.");
  }
}

async function runCollect(args) {
  const source = args.source;
  if (!isCatalogSource(source)) {
    console.error(`Неизвестный источник «${source}». Известные: ${Object.keys(CATALOG_SOURCES).join(", ")}`);
    process.exit(1);
  }
  const seed = args.seed;
  const out = args.out;
  if (!seed || !out) {
    console.error("Нужны --seed и --out (или --probe URL для разведки).");
    process.exit(1);
  }

  const delay = Number(args.delay ?? DEFAULT_DELAY_MS);
  const max = Number(args.max ?? Infinity);
  const stateFile = args.state ?? `${out}.state.json`;
  const linkPattern = args["link-pattern"] ? new RegExp(args["link-pattern"]) : undefined;

  mkdirSync(dirname(out), { recursive: true });

  const state = loadState(stateFile);
  const visited = new Set(state.visited);
  const queue = state.queued.length > 0 ? [...state.queued] : [seed];
  let written = state.written ?? 0;

  if (visited.size > 0) console.log(`Продолжаю: пройдено ${visited.size}, в очереди ${queue.length}`);
  else writeFileSync(out, toCsvLine(OUT_HEADER) + "\n");

  const origin = new URL(seed).origin;
  let disallows = [];
  if (args["ignore-robots"]) {
    console.log("robots.txt игнорируется по явному указанию.");
  } else {
    disallows = await loadRobots(origin);
    if (disallows === null) {
      // Не смогли прочитать — это не разрешение обходить всё. Останавливаемся:
      // цена ошибки здесь чужой сайт, а не наш прогон.
      console.error("Не удалось прочитать robots.txt. Проверьте доступность сайта.");
      console.error("Если владелец разрешил обход явно — повторите с --ignore-robots.");
      process.exit(1);
    }
    console.log(`robots.txt: ${disallows.length === 0 ? "ограничений нет" : disallows.join(", ")}`);
  }

  let pages = 0;
  const seenNames = new Set();

  while (queue.length > 0 && pages < max) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    if (!robotsAllows(url, disallows)) continue;

    visited.add(url);
    pages += 1;

    const result = await fetchPage(url);
    if (!result.ok) {
      console.error(`  пропуск ${url}: HTTP ${result.status}`);
      await sleep(delay);
      continue;
    }

    const table = findNutritionTable(result.html);
    if (table) {
      const rows = tableToRows(table);
      const c = table.columns;
      const lines = [];
      for (const row of rows) {
        const name = String(row[c.name] ?? "").trim();
        // Один и тот же продукт стоит на нескольких страницах каталога;
        // отсев здесь экономит и место, и работу импортёру.
        if (name === "" || seenNames.has(name)) continue;
        seenNames.add(name);
        lines.push(toCsvLine([
          name,
          row[c.kcal] ?? "",
          row[c.protein] ?? "",
          row[c.fat] ?? "",
          row[c.carbs] ?? "",
          c.fiber ? row[c.fiber] ?? "" : "",
          c.portion ? row[c.portion] ?? "" : "",
          c.ref ? row[c.ref] ?? "" : name,
        ]));
      }
      if (lines.length > 0) {
        // Дописываем сразу, а не копим в памяти: обход на десятки тысяч
        // страниц не должен терять всё из-за обрыва на середине.
        appendFileSync(out, lines.join("\n") + "\n");
        written += lines.length;
      }
      console.log(`[${pages}] ${url} — строк ${lines.length}, всего ${written}`);
    } else {
      // Списка нет — возможно, это карточка одного продукта. У каталогов
      // обычно есть и то и другое: страница раздела со списком и страницы
      // товаров, и пропускать вторые значило бы собрать половину.
      const record = extractVerticalRecord(result.html);
      if (record && !seenNames.has(record.name)) {
        seenNames.add(record.name);
        const v = record.values;
        appendFileSync(out, toCsvLine([
          record.name, v.kcal ?? "", v.protein ?? "", v.fat ?? "", v.carbs ?? "",
          v.fiber ?? "", v.portion ?? "", url,
        ]) + "\n");
        written += 1;
        console.log(`[${pages}] ${url} — карточка «${record.name}», всего ${written}`);
      } else {
        console.log(`[${pages}] ${url} — ни списка, ни карточки`);
      }
    }

    for (const link of extractLinks(result.html, url, linkPattern)) {
      if (!visited.has(link) && !queue.includes(link)) queue.push(link);
    }

    saveState(stateFile, { visited: [...visited], queued: queue, written });
    await sleep(delay);
  }

  console.log("");
  console.log(`Готово. Страниц за прогон: ${pages}, строк собрано всего: ${written}`);
  console.log(`Очередь: ${queue.length} — прогон можно повторить, продолжится с этого места.`);
  console.log("");
  console.log("Дальше — сухой прогон импорта:");
  console.log(`  node scripts/import-catalog.mjs --source ${source} --file ${out}`);
}

async function main() {
  await loadModules();
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.probe === "string") return runProbe(args.probe);
  return runCollect(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
