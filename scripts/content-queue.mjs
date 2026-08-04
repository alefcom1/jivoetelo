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

/**
 * Раздел очереди → что агент должен произвести.
 *
 * Раздел, которого здесь нет, парсер молча пропускает (`if (!kind) continue`).
 * Это удобно для заголовков-пояснений внутри очереди и опасно для новых
 * разделов работы: строки видны человеку, но конвейеру их как бы нет.
 * Заводя раздел в `docs/seo-pipeline.md`, заводите его и здесь.
 */
const SECTION_KINDS = {
  "Статьи журнала": "article",
  "Блюда — кластер «Супы»": "dish",
  "Блюда — кластер «Салаты и закуски»": "dish",
  "Блюда — кластер «Завтраки»": "dish",
  "Блюда — кластер «Второе горячее»": "dish",
  "Блюда — кластер «Быстрая еда»": "dish",
  "Блюда — кластер «Сладкое»": "dish",
  "Каталог продуктов": "product",
  "Глоссарий": "glossary",
  "Методология": "methodology",
  "Калькуляторы": "calculator",
};

/**
 * Роль позиции в составе ночи.
 *
 * Ночь собирается не «из разных разделов», а из трёх ролей: якорь, блюдо и
 * короткая. Правило «разных разделов» работало, пока разделов было пять
 * вперемешку, и переставало к концу очереди: когда остаются одни блюда,
 * «разные разделы» превращаются в три блюда подряд. Роли задают состав
 * жёстко — см. `docs/seo-pipeline.md`, «Состав ночи».
 */
const KIND_ROLES = {
  article: "anchor",
  methodology: "anchor",
  calculator: "anchor",
  dish: "dish",
  product: "short",
  glossary: "short",
};

/** Порядок ролей в ночи. Якорь первым: он самый дорогой и важный. */
const ROLES = ["anchor", "dish", "short"];

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
 * порядок задан частотностью запросов, и агент берёт первые.
 *
 * ## Затвор на раздел
 *
 * Строка `> ЖДЁТ РАЗДЕЛА: …` сразу под заголовком закрывает раздел целиком.
 * Нужна там, где тексты писать уже можно, а положить их ещё некуда: агенту
 * предписано в таком случае остановиться, и без затвора конвейер каждую ночь
 * тратил бы треть работы на отчёт «раздела нет».
 *
 * Это не «выключено навсегда», а «не раньше, чем появится место». Снять
 * затвор — удалить строку; ничего больше делать не надо.
 */
export function parseQueue(markdown) {
  const items = [];
  let section = null;
  let gated = false;

  for (const line of markdown.split("\n")) {
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      section = heading[1];
      gated = false;
      continue;
    }

    if (/^>\s*ЖДЁТ РАЗДЕЛА:/i.test(line)) {
      gated = true;
      continue;
    }

    const task = line.match(/^-\s+\[( |x)\]\s+(.+?)\s*$/);
    if (!task || !section || gated) continue;

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

/**
 * Что взять в работу этой ночью.
 *
 * Одна позиция каждой роли: якорь, блюдо, короткая. Внутри роли берём сверху
 * — порядок очереди задан полнотой кластера.
 *
 * Если пул роли пуст, слот отдаётся ближайшей непустой роли, но два текста
 * одного вида за ночь — потолок. Три одинаковых не выйдет никогда, и это
 * главное, ради чего роли заведены: три блюда за ночь — это три одинаковых
 * блюда, сколько бы разных названий у них ни было.
 *
 * `busy` — слаги, у которых уже есть неслитая ветка. Без этого фильтра
 * простой утренней проверки превращается в повторную работу: конвейер каждую
 * ночь берёт одну и ту же непроверенную верхушку очереди.
 */
export function pickBatch(items, take, busy = new Set()) {
  const free = items.filter((item) => !busy.has(item.slug));
  const batch = [];
  const perKind = new Map();

  const canTake = (item) => (perKind.get(item.kind) ?? 0) < MAX_PER_KIND;
  const add = (item) => {
    batch.push(item);
    perKind.set(item.kind, (perKind.get(item.kind) ?? 0) + 1);
  };

  // Сначала по одной позиции на роль, в порядке ролей.
  for (const role of ROLES) {
    if (batch.length >= take) break;
    const pick = free.find(
      (item) => !batch.includes(item) && KIND_ROLES[item.kind] === role && canTake(item),
    );
    if (pick) add(pick);
  }

  // Роль оказалась пустой — добираем сверху очереди, не нарушая потолка.
  while (batch.length < take) {
    const pick = free.find((item) => !batch.includes(item) && canTake(item));
    if (!pick) break;
    add(pick);
  }

  return batch;
}

/** Сколько текстов одного вида допустимо за ночь. */
const MAX_PER_KIND = 2;

function main() {
  const markdown = readFileSync(QUEUE_FILE, "utf8");
  const items = parseQueue(markdown);

  if (process.argv.includes("--count")) {
    console.log(String(items.length));
    return;
  }

  const takeAt = process.argv.indexOf("--take");
  const take = takeAt === -1 ? 1 : Math.max(1, Number(process.argv[takeAt + 1]) || 1);

  // Слаги занятых позиций приходят списком через запятую: workflow снимает их
  // с имён веток `content/<дата>-<slug>`, потому что только он и знает, что
  // сейчас лежит в origin.
  const busyAt = process.argv.indexOf("--busy");
  const busy = new Set(
    busyAt === -1 ? [] : (process.argv[busyAt + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );

  const batch = pickBatch(items, take, busy);

  // Пустая выборка — не ошибка: либо всё написано, либо верхушка очереди
  // целиком ждёт утренней проверки. Workflow читает `empty` и завершается,
  // не запуская агентов.
  console.log(JSON.stringify({
    empty: batch.length === 0,
    remaining: items.length,
    busy: busy.size,
    items: batch,
  }));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
