import test from "node:test";
import assert from "node:assert/strict";
import { buildImpactSection, describeEffect, describeYesterday } from "../lib/impact-text.ts";
import { FLAG_ALCOHOL, FLAG_LATE_MEAL, MIN_PAIRS_STATISTICAL } from "../lib/weight-response.ts";

/**
 * Слова, которых не должно быть ни в одном тексте этой функции.
 *
 * Первая группа — причинность: расчёт её не устанавливает, и говорить о ней
 * нельзя. Вторая — оценки еды: прямой запрет спецификации (раздел 4.3) и
 * обещание из юридического документа /legal/health («нет разделения еды на
 * "хорошую" и "плохую"»). Третья — давление и вина.
 */
const FORBIDDEN = [
  "влия", "воздейств", "из-за", "виноват", "вызыва", "приводит к", "мешает",
  "вредн", "полезн", "плох", "хорош", "запрещ", "нельзя есть", "исключите", "откажитесь",
  "реакция организма", "непереносим", "метаболизм", "диагноз", "доказано",
  "сорвал", "провал", "должны", "обязаны", "лишн",
];

function assertSafe(text) {
  const lower = text.toLowerCase();
  for (const word of FORBIDDEN) {
    assert.ok(!lower.includes(word), `в тексте не должно быть «${word}»:\n${text}`);
  }
}

function effect(overrides = {}) {
  return {
    key: "dish:pelmeni",
    nWith: 9,
    nWithout: 31,
    deltaKg: 0.7,
    ciLowKg: 0.3,
    ciHighKg: 1.1,
    pValue: 0.004,
    qValue: 0.02,
    reportable: true,
    ...overrides,
  };
}

function report(overrides = {}) {
  return {
    level: "statistical",
    usablePairs: 52,
    daysLogged: 60,
    kcalSlopeKgPer1000: 0.12,
    effects: [effect()],
    missingPairs: 0,
    ...overrides,
  };
}

test("описание эффекта называет блюдо, число, наблюдения — и объясняет про воду", () => {
  const text = describeEffect(effect());
  assert.match(text, /пельмени/i);
  assert.match(text, /0,7 кг/);
  assert.match(text, /выше вашего тренда/);
  assert.match(text, /9 наблюдений против 31/);
  assert.match(text, /вода/i, "объяснение про воду — часть фразы, а не сноска");
  assertSafe(text);
});

test("отрицательный эффект тоже объясняется водой, а не похудением", () => {
  const text = describeEffect(effect({ deltaKg: -0.6 }));
  assert.match(text, /0,6 кг ниже вашего тренда/);
  assert.match(text, /не потеря жира/);
  assertSafe(text);
});

test("признаки дня называются словами, а не ключами", () => {
  const alcohol = describeEffect(effect({ key: FLAG_ALCOHOL }));
  assert.match(alcohol, /в дни с алкоголем/i);
  assert.ok(!alcohol.includes("flag:"));
  assertSafe(alcohol);

  const late = describeEffect(effect({ key: FLAG_LATE_MEAL }));
  assert.match(late, /поздним ужином/i);
  assertSafe(late);
});

test("ниже нижнего порога раздела нет вовсе", () => {
  assert.equal(buildImpactSection(report({ level: "none", effects: [], usablePairs: 5 })), null);
});

test("на описательном уровне говорим, сколько не хватает, и почему это не задержка", () => {
  const section = buildImpactSection(report({ level: "descriptive", usablePairs: 20, missingPairs: 20, effects: [] }));
  assert.ok(section);
  assert.match(section.text, /20/);
  assert.match(section.text, new RegExp(String(MIN_PAIRS_STATISTICAL)));
  assert.match(section.text, /так устроен сам расчёт/);
  assertSafe(section.text);
});

test("данных хватило, но находок нет — это ответ, а не пустой раздел", () => {
  const section = buildImpactSection(report({ effects: [effect({ reportable: false })] }));
  assert.ok(section);
  assert.match(section.text, /не нашли ни одного блюда/);
  assert.match(section.text, /честный ответ/);
  assertSafe(section.text);
});

test("находка сопровождается оговоркой, что исключать ничего не нужно", () => {
  const section = buildImpactSection(report());
  assert.ok(section);
  assert.match(section.text, /наблюдения по вашему дневнику/i);
  assert.match(section.text, /убирать из рациона по ним нечего/);
  assertSafe(section.text);
});

test("непоказываемые эффекты в текст не попадают", () => {
  const section = buildImpactSection(report({
    effects: [effect({ key: "dish:tvorog", reportable: false, deltaKg: 0.9 }), effect()],
  }));
  assert.ok(section);
  assert.ok(!section.text.toLowerCase().includes("творог"), "не прошедшее пороги не показывается");
});

test("строка о вчерашнем дне молчит, когда отклонение в пределах обычного", () => {
  assert.equal(describeYesterday(0.1, []), null);
  assert.equal(describeYesterday(-0.2, []), null);
});

test("строка о вчерашнем дне объясняет скачок и называет признаки дня", () => {
  const text = describeYesterday(0.8, [FLAG_ALCOHOL, FLAG_LATE_MEAL]);
  assert.ok(text);
  assert.match(text, /0,8 кг выше вашего тренда/);
  assert.match(text, /алкоголем и поздним ужином/);
  assert.match(text, /это вода/i);
  assert.match(text, /столько жира не набирается/);
  assertSafe(text);
});

test("строка о вчерашнем дне без признаков не выдумывает причину", () => {
  const text = describeYesterday(-0.7, []);
  assert.ok(text);
  assert.ok(!text.includes("Вчера в записях"));
  assert.match(text, /смотреть стоит на тренд/);
  assertSafe(text);
});
