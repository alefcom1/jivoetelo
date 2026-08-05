import test from "node:test";
import assert from "node:assert/strict";
import { BIG_JUMP_KG, judgeReading, MAX_KG, MIN_KG, toKilograms } from "../lib/scale-reading.ts";

/**
 * Распознавание весов.
 *
 * Главное, что здесь проверяется, — неправдоподобное число не проходит молча.
 * Семисегментный индикатор путает 8 с 0, 6 и 9, и ошибка в разряде десятков
 * выглядит совершенно нормальным весом. Она попадёт в тренд, а тренд двигает
 * план — человек увидит изменившуюся норму и не свяжет её со снимком.
 */

const ok = (patch = {}) => ({ reading: 82.5, unit: "kg", confidence: "high", problem: null, ...patch });

/* ===== Перевод единиц ===== */

test("килограммы не трогаются", () => {
  assert.equal(toKilograms(82.5, "kg"), 82.5);
});

test("фунты и стоуны переводятся", () => {
  assert.equal(toKilograms(180, "lb"), 81.6);
  assert.equal(toKilograms(13, "st"), 82.6);
});

test("округление до десятых — как у поля ввода", () => {
  // 0,1 кг — шаг любых бытовых весов; больше знаков означало бы точность,
  // которой у прибора нет.
  const kg = toKilograms(181.4, "lb");
  assert.equal(Math.round(kg * 10) / 10, kg, `${kg} — лишние знаки`);
});

/* ===== Что проходит ===== */

test("обычный замер проходит без предупреждений", () => {
  const verdict = judgeReading(ok(), 82.1);
  assert.equal(verdict.kind, "read");
  assert.equal(verdict.weightKg, 82.5);
  assert.equal(verdict.warning, null);
});

test("первый замер сравнивать не с чем", () => {
  const verdict = judgeReading(ok(), null);
  assert.equal(verdict.kind, "read");
  assert.equal(verdict.warning, null);
});

test("границы диапазона внутри", () => {
  assert.equal(judgeReading(ok({ reading: MIN_KG }), null).kind, "read");
  assert.equal(judgeReading(ok({ reading: MAX_KG }), null).kind, "read");
});

/* ===== Что не проходит ===== */

test("вне диапазона — отказ, и число названо", () => {
  // Потерянная точка: 8,25 вместо 82,5. Отказ должен показать, что именно
  // прочиталось, иначе человек не поймёт, почему снимок не подошёл.
  const verdict = judgeReading(ok({ reading: 8.25 }), 82.1);
  assert.equal(verdict.kind, "rejected");
  assert.match(verdict.message, /8,3|8,2/);
});

test("слишком много — тоже отказ", () => {
  assert.equal(judgeReading(ok({ reading: 402 }), null).kind, "rejected");
});

test("каждая причина сбоя объясняется по-своему", () => {
  const messages = new Set();
  for (const problem of ["no_display", "unreadable", "not_weight"]) {
    const verdict = judgeReading(ok({ problem }), null);
    assert.equal(verdict.kind, "rejected", `${problem} прошёл`);
    messages.add(verdict.message);
  }
  assert.equal(messages.size, 3, "разные причины объясняются одинаково — человеку нечего исправить");
});

test("нет числа — нет замера, даже без явной причины", () => {
  assert.equal(judgeReading(ok({ reading: null }), null).kind, "rejected");
  assert.equal(judgeReading(ok({ unit: null }), null).kind, "rejected");
  assert.equal(judgeReading(ok({ reading: Number.NaN }), null).kind, "rejected");
});

/* ===== Предупреждения ===== */

test("скачок относительно прошлого замера — предупреждение с прошлым числом", () => {
  // Ровно та ошибка, ради которой всё это: 8 прочитана как 9.
  const verdict = judgeReading(ok({ reading: 92.5 }), 82.1);
  assert.equal(verdict.kind, "read", "предупреждение не должно запрещать сохранение");
  assert.ok(verdict.warning, "скачок в десять килограммов прошёл молча");
  assert.match(verdict.warning, /82,1/, "прошлый вес не назван — сравнивать не с чем");
});

test("порог именно на расхождении, а не на любом изменении", () => {
  const under = judgeReading(ok({ reading: 82.1 + BIG_JUMP_KG - 0.1 }), 82.1);
  assert.equal(under.warning, null, "обычное недельное изменение вызвало тревогу");
  const over = judgeReading(ok({ reading: 82.1 + BIG_JUMP_KG + 0.1 }), 82.1);
  assert.ok(over.warning, "скачок за порогом прошёл молча");
});

test("похудение замечается так же, как набор", () => {
  assert.ok(judgeReading(ok({ reading: 72 }), 82.1).warning);
});

test("не килограммы — говорим всегда, даже при уверенном разборе", () => {
  const verdict = judgeReading(ok({ reading: 180, unit: "lb" }), 81.5);
  assert.equal(verdict.kind, "read");
  assert.equal(verdict.weightKg, 81.6);
  assert.equal(verdict.converted, "lb");
  assert.match(verdict.warning, /фунт/);
});

test("неуверенность модели — тоже повод сверить", () => {
  const verdict = judgeReading(ok({ confidence: "low" }), 82.1);
  assert.ok(verdict.warning);
});

test("два предупреждения об одном числе не выдаются", () => {
  // При скачке о неуверенности уже не говорим: «не доверяй ничему» человек
  // перестаёт читать целиком.
  const verdict = judgeReading(ok({ reading: 92.5, confidence: "low" }), 82.1);
  assert.doesNotMatch(verdict.warning, /не уверена/);
});

/* ===== Тон ===== */

test("тексты не подгоняют и не оценивают", () => {
  const FORBIDDEN = [/вы должны/i, /обязательно/i, /неправильн/i, /ошибк/i];
  const cases = [
    judgeReading(ok({ problem: "no_display" }), null),
    judgeReading(ok({ problem: "unreadable" }), null),
    judgeReading(ok({ problem: "not_weight" }), null),
    judgeReading(ok({ reading: 8.25 }), null),
    judgeReading(ok({ reading: 92.5 }), 82.1),
    judgeReading(ok({ reading: 180, unit: "lb" }), null),
  ];
  for (const verdict of cases) {
    const text = verdict.kind === "read" ? verdict.warning : verdict.message;
    assert.ok(text, "пустой текст");
    for (const bad of FORBIDDEN) assert.ok(!bad.test(text), `«${text}» нарушает ${bad}`);
    assert.ok(!text.includes("!"), `«${text}» — восклицание не в голосе персонажа`);
  }
});

/* ===== Разбор ответа модели ===== */

test("ответ модели проверяется, а не принимается на веру", async () => {
  // Схема на стороне провайдера проверяется там же, где отвечает модель, и
  // наших тестов на неё нет. Это — наша проверка.
  const { validateScaleReading } = await import("../lib/ai/scale.ts");

  const good = validateScaleReading({ reading: 82.5, unit: "kg", confidence: "high", problem: null });
  assert.equal(good.reading, 82.5);
  assert.equal(good.unit, "kg");

  // Незнакомые значения не роняют разбор, но и не проходят как есть:
  // единица становится null (её отсеет judgeReading), уверенность —
  // средней. Обрушить чтение весов из-за опечатки модели незачем.
  const odd = validateScaleReading({ reading: "80", unit: "pounds", confidence: "уверен", problem: "странно" });
  assert.equal(odd.reading, 80, "число строкой должно приводиться");
  assert.equal(odd.unit, null);
  assert.equal(odd.confidence, "medium");
  assert.equal(odd.problem, null);

  assert.equal(validateScaleReading({ reading: null, unit: null, confidence: "low", problem: "unreadable" }).reading, null);
  assert.throws(() => validateScaleReading(null));
  assert.throws(() => validateScaleReading({ reading: "не число", unit: "kg", confidence: "high", problem: null }));
});
