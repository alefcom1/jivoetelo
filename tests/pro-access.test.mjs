import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACCESS_SCOPES,
  canAccess,
  grantedScopes,
  normalizeScopes,
  scopesToGrants,
  SCOPE_DETAILS,
  SCOPE_LABELS,
} from "../lib/pro/access.ts";

/**
 * Это единственный модуль в проекте, где ошибка означает не «неудобно», а
 * «чужой человек увидел мой дневник». Поэтому тесты здесь написаны от
 * противного: не «разрешение работает», а «перечисли всё, из-за чего доступ
 * обязан закрыться, и проверь каждое».
 */

const NOW = new Date("2026-08-11T12:00:00Z");

function link(overrides = {}) {
  return {
    specialistUserId: 1,
    clientUserId: 2,
    shareSummary: true,
    shareDiary: true,
    shareWeight: true,
    revokedAt: null,
    ...overrides,
  };
}

function ask(overrides = {}) {
  return canAccess({
    specialistUserId: 1,
    clientUserId: 2,
    status: "approved",
    link: link(),
    scope: "summary",
    now: NOW,
    ...overrides,
  });
}

test("подтверждённый специалист с разрешением видит разрешённое", () => {
  assert.deepEqual(ask(), { allowed: true });
});

test("без строки связи доступа нет", () => {
  // Умолчание всей системы: нет записи — нет доступа. Не наоборот.
  assert.deepEqual(ask({ link: null }), { allowed: false, reason: "no_link" });
});

test("не заводивший профиль специалиста не проходит даже со связью", () => {
  assert.deepEqual(ask({ status: null }), { allowed: false, reason: "no_specialist" });
});

test("неподтверждённый специалист не проходит ни в одном статусе, кроме approved", () => {
  // Саморегистрация «специалистом» кого угодно стоила бы дороже любого роста,
  // поэтому в пилот пускаем руками. Проверяем все статусы, а не один.
  for (const status of ["pending", "rejected", "suspended"]) {
    assert.deepEqual(
      ask({ status }),
      { allowed: false, reason: "specialist_not_approved" },
      `статус ${status} не должен давать доступ`,
    );
  }
});

test("отозванный доступ закрыт, даже если галочки остались стоять", () => {
  // Отзыв не снимает галочки — он ставит дату. Если бы проверка смотрела
  // только на галочки, отзыв не работал бы вовсе.
  const revoked = link({ revokedAt: new Date("2026-08-10T00:00:00Z") });
  for (const scope of ACCESS_SCOPES) {
    assert.deepEqual(
      ask({ link: revoked, scope }),
      { allowed: false, reason: "revoked" },
      `объём ${scope} после отзыва`,
    );
  }
});

test("отзыв, записанный будущим временем, ещё не действует", () => {
  // Такая строка может появиться только по ошибке, но «поле не пусто — значит
  // отозвано» закрыло бы доступ задним числом на ровном месте.
  const future = link({ revokedAt: new Date("2026-08-12T00:00:00Z") });
  assert.deepEqual(ask({ link: future }), { allowed: true });
});

test("отзыв срабатывает ровно в свою секунду, а не секундой позже", () => {
  assert.deepEqual(ask({ link: link({ revokedAt: NOW }) }), { allowed: false, reason: "revoked" });
});

test("неразрешённый объём закрыт при разрешённых соседних", () => {
  const summaryOnly = link({ shareDiary: false, shareWeight: false });
  assert.deepEqual(ask({ link: summaryOnly, scope: "summary" }), { allowed: true });
  assert.deepEqual(ask({ link: summaryOnly, scope: "diary" }), { allowed: false, reason: "scope_not_granted" });
  assert.deepEqual(ask({ link: summaryOnly, scope: "weight" }), { allowed: false, reason: "scope_not_granted" });
});

test("связь от другой пары не открывает доступ", () => {
  // Защита от ошибки вызывающего: если запрос и строка разошлись, верить
  // строке нельзя. Проверяем обе стороны пары по отдельности.
  assert.deepEqual(
    ask({ link: link({ specialistUserId: 99 }) }),
    { allowed: false, reason: "no_link" },
    "чужой специалист",
  );
  assert.deepEqual(
    ask({ link: link({ clientUserId: 99 }) }),
    { allowed: false, reason: "no_link" },
    "чужой клиент",
  );
});

test("сам себе клиентом не станешь", () => {
  const decision = canAccess({
    specialistUserId: 5,
    clientUserId: 5,
    status: "approved",
    link: link({ specialistUserId: 5, clientUserId: 5 }),
    scope: "diary",
    now: NOW,
  });
  assert.deepEqual(decision, { allowed: false, reason: "self" });
});

test("пустая связь не даёт ни одного объёма", () => {
  const nothing = link({ shareSummary: false, shareDiary: false, shareWeight: false });
  for (const scope of ACCESS_SCOPES) {
    assert.deepEqual(ask({ link: nothing, scope }), { allowed: false, reason: "scope_not_granted" });
  }
});

test("grantedScopes согласован с canAccess во всех сочетаниях галочек", () => {
  // Главное свойство пары функций: интерфейс показывает ровно то, что
  // откроется. Вкладка, которая при клике отказывает, — худший вид отказа,
  // поэтому проверяем все восемь сочетаний, а не выборочно.
  for (let mask = 0; mask < 8; mask += 1) {
    const row = link({
      shareSummary: Boolean(mask & 1),
      shareDiary: Boolean(mask & 2),
      shareWeight: Boolean(mask & 4),
    });
    const granted = grantedScopes(row, NOW);
    for (const scope of ACCESS_SCOPES) {
      const decision = canAccess({
        specialistUserId: 1,
        clientUserId: 2,
        status: "approved",
        link: row,
        scope,
        now: NOW,
      });
      assert.equal(
        granted.includes(scope),
        decision.allowed,
        `маска ${mask}, объём ${scope}: список и проверка разошлись`,
      );
    }
  }
});

test("grantedScopes на отозванной и отсутствующей связи пуст", () => {
  assert.deepEqual(grantedScopes(null, NOW), []);
  assert.deepEqual(grantedScopes(link({ revokedAt: new Date("2026-08-01T00:00:00Z") }), NOW), []);
});

test("normalizeScopes пропускает только известные значения", () => {
  // Список приходит из формы, то есть от пользователя. Лишнее слово в нём не
  // должно ни ломать разбор, ни тем более что-то открывать.
  assert.deepEqual(normalizeScopes(["diary", "summary"]), ["summary", "diary"]);
  assert.deepEqual(normalizeScopes(["diary", "admin", "*", 42, null]), ["diary"]);
  assert.deepEqual(normalizeScopes([]), []);
  assert.deepEqual(normalizeScopes("diary"), []);
  assert.deepEqual(normalizeScopes(undefined), []);
  assert.deepEqual(normalizeScopes({ diary: true }), []);
});

test("normalizeScopes не даёт дубликатов и держит один порядок", () => {
  assert.deepEqual(normalizeScopes(["weight", "weight", "summary"]), ["summary", "weight"]);
});

test("scopesToGrants и normalizeScopes сходятся обратно", () => {
  for (let mask = 0; mask < 8; mask += 1) {
    const scopes = ACCESS_SCOPES.filter((_, i) => mask & (1 << i));
    const grants = scopesToGrants(scopes);
    assert.deepEqual(grantedScopes({ ...link(), ...grants }, NOW), scopes);
  }
});

test("у каждого объёма есть название и объяснение, что именно увидят", () => {
  // «Доступ к данным» — не согласие: человек не может представить, на что
  // соглашается. Поэтому у каждой галочки обязана быть конкретика.
  for (const scope of ACCESS_SCOPES) {
    assert.ok(SCOPE_LABELS[scope]?.length > 0, scope);
    assert.ok(SCOPE_DETAILS[scope]?.length > 20, `${scope}: объяснение слишком короткое`);
  }
});
