import test from "node:test";
import assert from "node:assert/strict";

import { parseWeightMessage, MAX_WEIGHT_KG, MIN_WEIGHT_KG } from "../lib/bot/weight-message.ts";
import { daySummaryText, formatWeight, weightSavedText } from "../lib/bot/day-summary.ts";
import { inlineResults } from "../lib/bot/inline.ts";
import { generateReferralCode, isReferralCode, parseReferralPayload, referralPayload } from "../lib/referral.ts";
import { planWeighReminder, WEIGH_REMINDER_HOUR } from "../lib/reminders.ts";
import { htmlProblem } from "../lib/bot/markup.ts";
import { PREMIUM, ANSWERS, inviteText } from "../lib/bot/texts.ts";

// ===== Вес одним сообщением =====

test("вес: обычные записи с весов", () => {
  for (const [text, expected] of [
    ["72,4", 72.4],
    ["72.4", 72.4],
    ["72", 72],
    ["72,4 кг", 72.4],
    ["72.4кг", 72.4],
    ["вес 72,4", 72.4],
    ["Вес: 72,4 кг", 72.4],
    ["  81  ", 81],
  ]) {
    const parsed = parseWeightMessage(text);
    assert.deepEqual(parsed, { kind: "weight", weightKg: expected }, `не разобрано: «${text}»`);
  }
});

test("вес: описание еды весом не считается", () => {
  // Главное свойство разбора. Приняв за вес описание еды, бот запишет чужое
  // число, и обнаружится это через неделю обрывом на графике.
  for (const text of [
    "2 яйца и кофе",
    "борщ 300 г",
    "сегодня 72,4 было",
    "72,4 кг съел",
    "A1B2C3D4",
    "1200",
    "",
    "-72",
    "72,456",
  ]) {
    assert.equal(parseWeightMessage(text), null, `ошибочно принято за вес: «${text}»`);
  }
});

test("вес: мелкие числа не наши, а крупные — ошибка ввода", () => {
  // «5» — это скорее количество чего-то, и отвечать на него «вес должен быть
  // от 30 кг» навязчиво. А вот «450» человек явно вводил как вес.
  assert.equal(parseWeightMessage("5"), null);
  assert.equal(parseWeightMessage("12"), null);
  assert.deepEqual(parseWeightMessage("20"), { kind: "out_of_range", value: 20 });
  assert.deepEqual(parseWeightMessage("450"), { kind: "out_of_range", value: 450 });
  assert.equal(parseWeightMessage(String(MIN_WEIGHT_KG)).kind, "weight");
  assert.equal(parseWeightMessage(String(MAX_WEIGHT_KG)).kind, "weight");
});

test("вес: формат подтверждения — как на весах", () => {
  assert.equal(formatWeight(72.4), "72,4");
  assert.equal(formatWeight(72), "72");
  assert.equal(formatWeight(72.44), "72,4");
});

// ===== Итог дня =====

const TARGETS = {
  kcalTarget: 1800,
  kcalMin: 1674,
  kcalMax: 1926,
  proteinTarget: 95,
  fiberTarget: 25,
  adjusted: false,
  source: "formula",
};

const TOTALS = { kcal: 1420, protein: 78, fat: 55, carbs: 140, fiber: 18 };

test("итог дня: коридор, а не одна цифра", () => {
  const text = daySummaryText({
    totals: TOTALS,
    targets: TARGETS,
    mealsCount: 3,
    pendingPhotos: 0,
    showCalories: true,
  });
  assert.match(text, /<b>1420<\/b> из 1674–1926 ккал/);
  assert.match(text, /Белок: <b>78<\/b> из 95 г/);
  assert.match(text, /Записано 3 приёма/);
  assert.equal(htmlProblem(text), null);
});

test("итог дня: своя норма — точка, и об этом сказано", () => {
  const text = daySummaryText({
    totals: TOTALS,
    targets: { ...TARGETS, source: "manual", kcalMin: 1600, kcalMax: 1600, kcalTarget: 1600 },
    mealsCount: 2,
    pendingPhotos: 0,
    showCalories: true,
  });
  assert.match(text, /<b>1420<\/b> из 1600 ккал/);
  assert.doesNotMatch(text, /1674/);
  // У своей нормы коридора нет, и слово «коридор» здесь звучало бы как чужое.
  assert.doesNotMatch(text, /коридор/);
  assert.match(text, /Норма задана вами/);
});

test("итог дня: неразобранные снимки меняют смысл чисел, и это сказано", () => {
  const text = daySummaryText({
    totals: TOTALS,
    targets: TARGETS,
    mealsCount: 1,
    pendingPhotos: 2,
    showCalories: true,
  });
  assert.match(text, /2 снимка ждут разбора/);
  assert.match(text, /энергия сюда ещё не вошла/);
});

test("итог дня: режим без калорий уважается", () => {
  const text = daySummaryText({
    totals: TOTALS,
    targets: TARGETS,
    mealsCount: 3,
    pendingPhotos: 0,
    showCalories: false,
  });
  assert.doesNotMatch(text, /ккал/);
  assert.match(text, /Белок/);
});

test("итог дня: пустой день — приглашение, а не упрёк", () => {
  const text = daySummaryText({
    totals: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
    targets: TARGETS,
    mealsCount: 0,
    pendingPhotos: 0,
    showCalories: true,
  });
  assert.match(text, /записей пока нет/);
  // Ни одного слова осуждения: то же правило, что у напоминаний.
  assert.doesNotMatch(text, /пропустил|сорвал|плохо|失/i);
});

test("итог дня и подтверждение веса — валидный HTML", () => {
  assert.equal(htmlProblem(weightSavedText(72.4, "Тренд за неделю: −0,3 кг.")), null);
  assert.equal(htmlProblem(weightSavedText(72.4, null)), null);
});

// ===== Инлайн-режим =====

const LINKS = {
  dishUrl: (slug) => `https://jivoetelo.ru/skolko-kalorij/${slug}`,
  planUrl: "https://jivoetelo.ru/raschet/plan",
};

test("инлайн: блюдо находится и отвечает диапазоном", () => {
  const results = inlineResults("борщ", LINKS);
  assert.ok(results.length > 0);
  const first = results[0];
  assert.equal(first.type, "article");
  assert.match(first.id, /^dish:/);
  assert.match(first.input_message_content.message_text, /ккал на 100 г/);
  assert.match(first.input_message_content.message_text, /skolko-kalorij/);
});

test("инлайн: продукт из справочника тоже находится", () => {
  const results = inlineResults("куриная грудка", LINKS);
  assert.ok(results.length > 0);
  assert.match(results[0].id, /^(food|dish):/);
});

test("инлайн: идентификаторы уникальны и влезают в 64 байта", () => {
  for (const query of ["", "борщ", "молоко", "греческий", "сыр"]) {
    const results = inlineResults(query, LINKS);
    const ids = results.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, `дубли id на запросе «${query}»`);
    for (const id of ids) {
      assert.ok(Buffer.byteLength(id, "utf8") <= 64, `id длиннее 64 байт: ${id}`);
    }
  }
});

test("инлайн: одна буква не считается запросом", () => {
  assert.deepEqual(inlineResults("б", LINKS), []);
});

test("инлайн: пустой запрос показывает примеры, а не пустоту", () => {
  const results = inlineResults("", LINKS);
  assert.ok(results.length > 0);
  assert.ok(results.every((r) => r.id.startsWith("dish:")));
});

test("инлайн: разметка сообщений валидна", () => {
  for (const query of ["", "борщ", "молоко"]) {
    for (const result of inlineResults(query, LINKS)) {
      assert.equal(
        htmlProblem(result.input_message_content.message_text),
        null,
        `сломанная разметка в результате «${result.title}»`,
      );
    }
  }
});

// ===== Реферальные ссылки =====

test("реферальный код: алфавит без похожих знаков", () => {
  // Код читают с чужого экрана и пересказывают голосом: «0» против «O» здесь
  // стоит потерянного человека.
  for (let i = 0; i < 200; i += 1) {
    const code = generateReferralCode();
    assert.ok(isReferralCode(code), `невалидный код: ${code}`);
    assert.doesNotMatch(code, /[01OIL]/, `в коде похожие знаки: ${code}`);
  }
});

test("реферальная ссылка: разбор payload", () => {
  const code = "K7M2QX";
  assert.equal(parseReferralPayload(referralPayload(code)), code);
  assert.equal(parseReferralPayload("REF_K7M2QX"), code);
  assert.equal(parseReferralPayload("ref_k7m2qx"), code);
  // Не наше: метки места, код привязки, мусор.
  assert.equal(parseReferralPayload("plan"), null);
  assert.equal(parseReferralPayload("A1B2C3D4"), null);
  assert.equal(parseReferralPayload("ref_K7M2Q"), null);
  assert.equal(parseReferralPayload("ref_K7M2QX1"), null);
  assert.equal(parseReferralPayload("ref_K7M20X"), null);
});

test("приглашение: наград не обещаем", () => {
  const text = inviteText("https://t.me/jivelo_bot?start=ref_K7M2QX", 0);
  assert.match(text, /пока никто не пришёл/);
  assert.equal(htmlProblem(text), null);
  assert.equal(htmlProblem(inviteText("https://t.me/jivelo_bot?start=ref_K7M2QX", 3)), null);
  assert.match(inviteText("x", 3), /<b>3<\/b>/);
});

// ===== Напоминание взвеситься =====

const WEIGH_BASE = {
  localDay: "2026-08-10",
  localHour: WEIGH_REMINDER_HOUR,
  enabled: true,
  lastWeighReminderOn: null,
  lastWeightOn: null,
  hasProfile: true,
};

test("весы: пишем утром тому, кто давно не взвешивался", () => {
  const plan = planWeighReminder(WEIGH_BASE);
  assert.ok(plan);
  assert.equal(plan.kind, "weigh_nudge");
  assert.equal(htmlProblem(plan.text), null);
});

test("весы: тому, кто взвешивается сам, не напоминаем", () => {
  assert.equal(planWeighReminder({ ...WEIGH_BASE, lastWeightOn: "2026-08-08" }), null);
  // Четыре дня — уже повод.
  assert.ok(planWeighReminder({ ...WEIGH_BASE, lastWeightOn: "2026-08-06" }));
});

test("весы: не чаще раза в неделю", () => {
  assert.equal(planWeighReminder({ ...WEIGH_BASE, lastWeighReminderOn: "2026-08-05" }), null);
  assert.ok(planWeighReminder({ ...WEIGH_BASE, lastWeighReminderOn: "2026-08-03" }));
});

test("весы: только утром и только с профилем", () => {
  assert.equal(planWeighReminder({ ...WEIGH_BASE, localHour: 8 }), null);
  assert.equal(planWeighReminder({ ...WEIGH_BASE, localHour: 13 }), null);
  assert.equal(planWeighReminder({ ...WEIGH_BASE, localHour: 21 }), null);
  assert.equal(planWeighReminder({ ...WEIGH_BASE, hasProfile: false }), null);
  assert.equal(planWeighReminder({ ...WEIGH_BASE, enabled: false }), null);
});

// ===== Платный доступ =====

test("платный доступ: пока выключен — никаких «скоро» и кнопок", () => {
  assert.match(PREMIUM.notYet, /Платного тарифа сейчас нет/);
  for (const text of Object.values(PREMIUM)) {
    assert.equal(htmlProblem(text), null);
  }
});

test("справка перечисляет новые команды", () => {
  for (const command of ["/day", "/invite", "/premium"]) {
    assert.ok(ANSWERS.help.includes(command), `в справке нет ${command}`);
  }
  assert.equal(htmlProblem(ANSWERS.help), null);
});
