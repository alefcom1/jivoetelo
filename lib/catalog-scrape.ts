/**
 * Разбор страниц каталога: извлечение таблиц и ссылок из разметки.
 *
 * Чистый модуль — на вход строка HTML, на выход данные. Сеть, вежливость и
 * обход в scripts/collect-catalog.mjs. Разделение здесь не ради красоты: без
 * него разбор можно было бы проверить только живым запросом к чужому сайту,
 * а так он проверяется на образцах разметки в tests/catalog-scrape.test.mjs.
 *
 * ## Почему разбор общий, а не по сайту
 *
 * Соблазн был написать под каждый источник свои селекторы. Но у таблиц
 * калорийности есть свойство, которое надёжнее любой вёрстки: **у них
 * осмысленные заголовки**. «Белки», «Жиры», «Углеводы» стоят в шапке у всех,
 * потому что иначе таблицу не прочтёт человек.
 *
 * Поэтому таблица опознаётся по смыслу заголовков (теми же подсказками,
 * которыми импортёр разбирает CSV), а не по классам и вложенности. Такой
 * разбор переживает редизайн и работает на источнике, которого мы не видели.
 *
 * Где он не сработает — там останутся два запасных пути: данные в JSON-LD и
 * данные во встроенном JSON (`__NEXT_DATA__` и подобное). Оба тоже здесь.
 */

import { COLUMN_HINTS, guessColumns, missingColumns, type ColumnMap } from "./catalog-import.ts";

export type HtmlTable = {
  headers: string[];
  rows: string[][];
  /** Опознанные колонки: наше поле → заголовок в таблице. */
  columns: Partial<ColumnMap>;
  /** Годится ли таблица: есть все обязательные колонки и хотя бы одна строка. */
  usable: boolean;
};

/**
 * Снимает теги и приводит сущности к тексту.
 *
 * Тег заменяется пробелом, а не пустотой: иначе «<b>Творог</b><i>5%</i>»
 * слиплось бы в «Творог5%». Но тогда появляется обратная беда — «<b>Творог</b>,
 * 5%» даёт «Творог , 5%», и пробел перед запятой уезжает в название продукта.
 * Поэтому пробелы перед знаками препинания убираются отдельным проходом:
 * разметка внутри названий у каталогов сплошь и рядом.
 */
export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\s+([,;:.!?%)\]])/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", mdash: "—", ndash: "–",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);
}

/**
 * Вытаскивает все таблицы страницы.
 *
 * Заголовками считается либо строка с `th`, либо первая строка таблицы —
 * второе встречается чаще, чем хотелось бы: у половины русских каталогов
 * шапка свёрстана обычными ячейками.
 */
export function extractTables(html: string): HtmlTable[] {
  const tables: HtmlTable[] = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;

  for (const tableMatch of html.matchAll(tableRe)) {
    const body = tableMatch[1];
    const rawRows: string[][] = [];

    for (const rowMatch of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells: string[] = [];
      for (const cellMatch of rowMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)) {
        cells.push(stripTags(cellMatch[1]));
      }
      if (cells.length > 0) rawRows.push(cells);
    }
    if (rawRows.length < 2) continue;

    const headers = rawRows[0];
    const rows = rawRows.slice(1)
      // Строки-разделители и подзаголовки: в них меньше ячеек, чем в шапке.
      .filter((cells) => cells.length >= headers.length - 1)
      .filter((cells) => cells.some((cell) => cell !== ""));

    const columns = guessColumns(headers);
    tables.push({
      headers,
      rows,
      columns,
      usable: missingColumns(columns).length === 0 && rows.length > 0,
    });
  }

  return tables;
}

/** Таблица с составом, если она на странице есть. */
export function findNutritionTable(html: string): HtmlTable | null {
  const tables = extractTables(html);
  // Из нескольких годных берём самую длинную: на странице каталога рядом с
  // основной таблицей часто стоит короткая врезка «похожие продукты».
  return tables.filter((t) => t.usable).sort((a, b) => b.rows.length - a.rows.length)[0] ?? null;
}

/**
 * ## Вертикальная таблица — страница одного продукта
 *
 * Всё выше рассчитано на список: продукты строками, нутриенты в шапке. Но у
 * страницы **отдельного** продукта состав почти всегда свёрстан наоборот —
 * нутриент в первой ячейке, число во второй:
 *
 *     Калорийность | 110 ккал
 *     Белки        | 4.2 г
 *     Жиры         | 1.1 г
 *
 * Заголовков в нашем смысле там нет вовсе (шапка — «Показатель | Значение»
 * или её нет), и общий разбор такую таблицу не узнаёт. Поэтому отдельный
 * проход: ищем строки, где первая ячейка похожа на название нутриента, и
 * разворачиваем их в одну запись.
 *
 * Имя продукта берём из `h1`, а если его нет — из `title`: на карточке
 * товара это он и есть.
 */
export type VerticalRecord = { name: string; values: Record<string, string> };

/** Первая ячейка строки → наше поле. */
function nutrientField(label: string): string | null {
  const low = label.toLowerCase().replace(/ё/g, "е").trim();
  if (low === "") return null;
  for (const [field, hints] of Object.entries(COLUMN_HINTS)) {
    // Имя продукта в вертикальной таблице не ищем: оно в заголовке страницы,
    // а ячейка «Наименование» увела бы разбор не туда.
    if (field === "name" || field === "ref") continue;
    if (hints.some((hint) => low === hint || low.startsWith(hint))) return field;
  }
  return null;
}

export function extractPageTitle(html: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const text = stripTags(h1[1]);
    if (text !== "") return text;
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title ? stripTags(title[1]) : "";
}

/**
 * Состав со страницы одного продукта или `null`, если её не опознать.
 *
 * Требуем как минимум калорийность и один макронутриент: одинокая строчка
 * «Белки | 4 г» на странице рецепта — не карточка продукта, и принимать её
 * за таковую значило бы засорить каталог.
 */
export function extractVerticalRecord(html: string): VerticalRecord | null {
  const values: Record<string, string> = {};

  // Таблицы и списки определений: и то и другое встречается.
  const pairs: Array<[string, string]> = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => stripTags(m[1]));
    if (cells.length >= 2) pairs.push([cells[0], cells[1]]);
  }
  for (const dlMatch of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    pairs.push([stripTags(dlMatch[1]), stripTags(dlMatch[2])]);
  }

  for (const [label, value] of pairs) {
    const field = nutrientField(label);
    // Первое вхождение выигрывает: ниже по странице обычно идут таблицы
    // «на порцию» и «% суточной нормы», и они бы затёрли состав на 100 г.
    if (field && !(field in values)) values[field] = value;
  }

  const macros = ["protein", "fat", "carbs"].filter((f) => f in values);
  if (!("kcal" in values) || macros.length === 0) return null;

  const name = extractPageTitle(html);
  if (name === "") return null;
  return { name, values };
}

/** Строки таблицы → объекты с заголовками в ключах, как их ждёт импортёр. */
export function tableToRows(table: HtmlTable): Array<Record<string, string>> {
  return table.rows.map((cells) =>
    Object.fromEntries(table.headers.map((header, at) => [header, cells[at] ?? ""])));
}

/**
 * Ссылки страницы, приведённые к абсолютным.
 *
 * `pattern` отсеивает лишнее: у каталога на странице сотни ссылок, а нужны
 * только те, что ведут вглубь него.
 */
export function extractLinks(html: string, base: string, pattern?: RegExp): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    const raw = decodeEntities(match[1]).trim();
    if (raw === "" || raw.startsWith("#") || raw.startsWith("javascript:") || raw.startsWith("mailto:")) continue;
    let absolute: string;
    try {
      absolute = new URL(raw, base).toString();
    } catch {
      continue;
    }
    // Якорь отбрасываем: одна и та же страница с разными якорями — одна
    // страница, а для обхода это разные адреса и лишние запросы.
    const clean = absolute.split("#")[0];
    if (pattern && !pattern.test(clean)) continue;
    found.add(clean);
  }
  return [...found];
}

/**
 * Данные из JSON-LD. Запасной путь для страниц, где состав размечен
 * schema.org, а не таблицей: у рецептов это обычное дело.
 */
export function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      out.push(JSON.parse(match[1].trim()));
    } catch {
      // Битый JSON-LD на чужой странице — не наша забота и не повод падать.
    }
  }
  return out;
}

/**
 * Встроенные состояния фреймворков: `__NEXT_DATA__`, `window.__INITIAL_STATE__`.
 * Третий запасной путь — там данные лежат уже разобранными, без вёрстки.
 */
export function extractEmbeddedJson(html: string): unknown[] {
  const out: unknown[] = [];
  const patterns = [
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/i,
    /window\.__NUXT__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    try {
      out.push(JSON.parse(match[1]));
    } catch {
      // см. выше
    }
  }
  return out;
}

/** Что удалось понять про страницу — основа режима разведки. */
export type PageProbe = {
  tables: number;
  usableTables: number;
  headers: string[][];
  columns: Partial<ColumnMap> | null;
  missing: string[];
  sampleRows: string[][];
  /** Опознана ли страница как карточка одного продукта. */
  vertical: VerticalRecord | null;
  links: number;
  jsonLd: number;
  embeddedJson: number;
};

export function probePage(html: string, base: string, linkPattern?: RegExp): PageProbe {
  const tables = extractTables(html);
  const best = findNutritionTable(html);
  return {
    tables: tables.length,
    usableTables: tables.filter((t) => t.usable).length,
    headers: tables.map((t) => t.headers),
    columns: best?.columns ?? null,
    missing: best ? [] : missingColumns(tables[0]?.columns ?? {}),
    sampleRows: best ? best.rows.slice(0, 3) : [],
    vertical: best ? null : extractVerticalRecord(html),
    links: extractLinks(html, base, linkPattern).length,
    jsonLd: extractJsonLd(html).length,
    embeddedJson: extractEmbeddedJson(html).length,
  };
}

/**
 * ## robots.txt
 *
 * Разрешение владельца не отменяет robots.txt: там записаны и технические
 * ограничения — разделы, обход которых кладёт сайт. Читаем и уважаем.
 *
 * Разбор нарочно простой: нас интересует только `User-agent: *` и `Disallow`.
 * Полная спецификация с приоритетами групп и wildcards здесь избыточна.
 */
export function robotsDisallows(robotsTxt: string, userAgent = "*"): string[] {
  const lines = robotsTxt.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim());
  const disallows: string[] = [];
  let active = false;

  for (const line of lines) {
    const [rawField, ...rest] = line.split(":");
    if (rest.length === 0) continue;
    const field = rawField.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (field === "user-agent") {
      active = value === "*" || value.toLowerCase() === userAgent.toLowerCase();
      continue;
    }
    if (active && field === "disallow" && value !== "") disallows.push(value);
  }
  return disallows;
}

export function robotsAllows(url: string, disallows: string[]): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return !disallows.some((rule) => {
    // `*` внутри правила: превращаем в регулярное выражение, остальное —
    // обычный префикс.
    if (rule.includes("*")) {
      const source = "^" + rule.split("*").map(escapeRegExp).join(".*");
      return new RegExp(source).test(path);
    }
    return path.startsWith(rule);
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
