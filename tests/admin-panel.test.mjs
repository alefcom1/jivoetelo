import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { AI_OPERATIONS, OPERATION_LABELS, OPERATION_SHORT } from "../lib/quota-policy.ts";

/**
 * Связки админки, которые ломаются молча.
 *
 * Ни одна проверка здесь не ходит в базу — запросы `lib/admin-stats.ts` и
 * `lib/admin-people.ts` проверяются на живых данных, а не в тестах. Здесь
 * другое: места, где две половины одного механизма живут в разных файлах и
 * расходятся без единой ошибки на экране. Ключ раздела ленты задаётся строкой
 * в SQL, а подпись к нему — словарём в JSX; операции перечислены в политике
 * лимитов, а колонки таблицы расхода строятся отдельно. Разъедется — на
 * странице появится английский ключ вместо подписи или исчезнет колонка, и
 * заметит это только тот, кто помнит, как должно быть.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(path.join(ROOT, ...parts), "utf8");

const peopleLib = read("lib", "admin-people.ts");
const usersPage = read("app", "admin", "users", "page.tsx");
const spendPage = read("app", "admin", "rashod", "page.tsx");
const layout = read("app", "admin", "layout.tsx");
const actions = read("app", "admin", "actions.ts");

/** Ключи разделов, которые `personTimeline` выдаёт литералами в UNION. */
function timelineKinds() {
  const query = peopleLib.slice(peopleLib.indexOf("SELECT at, kind, detail FROM ("));
  return [...query.matchAll(/SELECT [a-z_]+(?: AS at)?,\s*'([a-z]+)'/g)].map((m) => m[1]);
}

/** Ключи словаря подписей на странице. */
function labelKeys(source, name) {
  const start = source.indexOf(`const ${name}: Record<string, string> = {`);
  assert.notEqual(start, -1, `${name} не найден`);
  const body = source.slice(start, source.indexOf("};", start));
  return [...body.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]);
}

test("у каждого раздела ленты действий есть русская подпись", () => {
  const kinds = timelineKinds();
  assert.ok(kinds.length >= 10, `в ленте всего ${kinds.length} источников — похоже, разбор запроса сломался`);
  const labelled = new Set(labelKeys(usersPage, "EVENT_LABELS"));
  const missing = kinds.filter((kind) => !labelled.has(kind));
  assert.deepEqual(missing, [], "источник события есть, подписи к нему нет — на странице будет английский ключ");
});

test("лишних подписей в ленте нет", () => {
  // Обратная сторона: подпись, потерявшая свой источник, — это строка,
  // которая никогда не покажется. Сама по себе она безвредна, но читается
  // как «такое событие бывает», и по ней ищут то, чего в ленте не будет.
  const kinds = new Set(timelineKinds());
  const extra = labelKeys(usersPage, "EVENT_LABELS").filter((key) => !kinds.has(key));
  assert.deepEqual(extra, []);
});

test("каждое обращение к чужим данным подписано в журнале", () => {
  // Область пишется строкой в вызове logAdminAccess и переводится словарём на
  // странице. Незнакомая область покажется как есть — «revoke» вместо
  // «снят доступ», — и журнал, который читают при разборе жалобы, начнёт
  // говорить по-английски.
  const scopes = [...`${actions}\n${peopleLib}`.matchAll(/logAdminAccess\([^)]*?,\s*"([a-z_]+)"\)/g)]
    .map((m) => m[1]);
  assert.ok(scopes.length > 0, "разбор вызовов logAdminAccess сломался");
  const labelled = new Set(labelKeys(usersPage, "SCOPE_LABELS"));
  assert.deepEqual(scopes.filter((scope) => !labelled.has(scope)), []);
});

test("таблицы расхода строятся из списка операций, а не из переписанного списка", () => {
  // Новая операция (например, чтение весов, которое появилось позже прочих)
  // обязана появиться в колонках сама. Перечисление руками означало бы, что
  // расход по ней просто не показывается — а деньги при этом тратятся.
  assert.match(spendPage, /AI_OPERATIONS\.map/);
  for (const operation of AI_OPERATIONS) {
    assert.ok(OPERATION_LABELS[operation], `у операции ${operation} нет подписи`);
    assert.ok(!spendPage.includes(`"${operation}"`), `операция ${operation} перечислена в разметке руками`);
  }
});

test("в шапке таблицы стоят короткие названия операций", () => {
  // Полные подписи написаны для фразы «на сегодня доступные … закончились».
  // В шапке они растягивали таблицу шире экрана, и обрезалась крайняя правая
  // колонка — итог, ради которого таблицу и открывают.
  assert.match(spendPage, /OPERATION_SHORT\[operation\]/);
  for (const operation of AI_OPERATIONS) {
    const short = OPERATION_SHORT[operation];
    assert.ok(short, `у операции ${operation} нет короткого названия`);
    assert.ok(short.length <= 12, `короткое название «${short}» не короткое`);
  }
});

test("страница расхода есть в навигации админки", () => {
  // Раздел, до которого нельзя дойти мышью, существует только для того, кто
  // помнит адрес. Ровно так уже вышло с «Людьми».
  assert.match(layout, /href="\/admin\/rashod"/);
});

test("переключатель тарифа знает, открыт ли доступ сейчас", () => {
  // Кнопка «перевести на бесплатный» должна быть выключена, когда снимать
  // нечего: активная кнопка, которая ничего не делает, читается как поломка.
  assert.match(usersPage, /hasAccess=\{card\.plan === "premium"\}/);
  const grant = read("app", "admin", "users", "grant-access.tsx");
  assert.match(grant, /disabled=\{busy \|\| !hasAccess\}/);
});

test("снятие доступа проверяет права само, а не полагается на макет", () => {
  // Server action вызывается отдельным запросом, которого макет не видит.
  const body = actions.slice(actions.indexOf("export async function revokeAccessAction"));
  const guard = body.indexOf("requireAdmin()");
  const work = body.indexOf("revokeAccess(personId)");
  assert.ok(guard !== -1 && work !== -1 && guard < work, "проверка прав должна стоять до снятия доступа");
});
