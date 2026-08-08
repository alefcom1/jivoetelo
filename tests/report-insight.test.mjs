import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALCOHOL_LINE,
  buildInsightFacts,
  canAnalyze,
  habitReminders,
  insightSections,
  MIN_DAYS_FOR_INSIGHT,
  validateInsight,
} from "../lib/report-insight.ts";
import { buildInsightPrompt } from "../lib/ai/insight.ts";

/**
 * Разбор питания в отчёте.
 *
 * Проверяется граница между нами и моделью — та самая, ради которой модуль и
 * разделён надвое. Все числа считает наш код и отдаёт готовыми; модель их
 * только читает. Тест следит, чтобы во входных данных было ровно то, что мы
 * посчитали, и ни слова о том, чего мы не измеряем.
 */

const DAYS = [
  { day: "2026-03-09", kcal: 1800, protein: 90, fiber: 20 },
  { day: "2026-03-10", kcal: 2200, protein: 110, fiber: 25 },
  { day: "2026-03-11", kcal: 2000, protein: 100, fiber: 22 },
];

const TARGETS = { kcalTarget: 2100, proteinTarget: 120, fiberTarget: 25 };

function facts(overrides = {}) {
  return buildInsightFacts({
    periodLabel: "неделя",
    daysInPeriod: 7,
    dayStats: DAYS,
    targets: TARGETS,
    frequentDishes: [{ name: "Гречка", times: 5 }, { name: "Творог", times: 4 }],
    weightChangeKg: -0.4,
    showCalories: true,
    ...overrides,
  });
}

test("числа считает наш код, а не модель", () => {
  const value = facts();
  assert.equal(value.avgKcal, 2000, "среднее должно быть посчитано, а не оставлено модели");
  assert.equal(value.minKcal, 1800);
  assert.equal(value.maxKcal, 2200);
  assert.equal(value.avgProtein, 100);
  assert.equal(value.daysLogged, 3);
});

test("средние берутся по дням с записями, а не по всем дням периода", () => {
  // Иначе смешались бы два разных факта: «стал есть меньше» и «стал реже
  // записывать». Первое про еду, второе про дневник.
  assert.equal(facts({ daysInPeriod: 30 }).avgKcal, 2000);
});

test("мало дней — разбора нет вовсе", () => {
  for (let days = 0; days < MIN_DAYS_FOR_INSIGHT; days += 1) {
    assert.equal(canAnalyze({ daysLogged: days }), false, `${days} дн.`);
  }
  assert.equal(canAnalyze({ daysLogged: MIN_DAYS_FOR_INSIGHT }), true);
});

test("скрытые калории не возвращаются к человеку письмом", () => {
  // Человек сознательно убрал цифры энергии с экрана. Прислать их в отчёте —
  // отменить его собственную настройку.
  const prompt = buildInsightPrompt(facts({ showCalories: false }));
  assert.doesNotMatch(prompt, /ккал/, prompt);
  assert.match(prompt, /скрыл калории/);
  // Белок и клетчатка при этом остаются: режим прячет энергию, а не всё.
  assert.match(prompt, /Белок/);
});

test("во входных данных нет того, чего мы не измеряем", () => {
  // Шаги, вода, сон и тренировки в дневнике не хранятся. Попади они в
  // запрос хоть словом — модель напишет о них как о факте.
  const prompt = buildInsightPrompt(facts());
  assert.doesNotMatch(prompt, /шаг|воды|воду|тренировк|сон |сна /i, prompt);
});

test("запрет на выдуманные числа стоит в самом запросе", () => {
  // Единственная защита от цифры, которой у нас нет: проверить её постфактум
  // нечем, пересчитывать ответ значило бы писать второй разбор.
  const prompt = buildInsightPrompt(facts());
  assert.match(prompt, /Гречка: 5 раз/, "частые блюда должны приходить готовым списком");
});

test("ответ модели проверяется, а пустой разбор — законный исход", () => {
  const ok = validateInsight({ observation: "  Рацион держится ровно.  ", dishNotes: ["Гречка — опора."] });
  assert.equal(ok.observation, "Рацион держится ровно.");
  assert.deepEqual(ok.dishNotes, ["Гречка — опора."]);

  assert.deepEqual(validateInsight({ observation: "Ровно.", dishNotes: [] }).dishNotes, []);
  assert.throws(() => validateInsight({ observation: "   ", dishNotes: [] }), /пустое наблюдение/);
  assert.throws(() => validateInsight(null), /не объект/);
  // Больше трёх заметок в письмо не пойдёт, сколько бы ни прислали.
  assert.equal(validateInsight({ observation: "x", dishNotes: ["a", "b", "c", "d", "e"] }).dishNotes.length, 3);
});

test("напоминания о привычках чередуются и не выдумывают данных", () => {
  const seen = new Set();
  for (let index = 0; index < 8; index += 1) {
    const [line] = habitReminders({ periodIndex: index, hadAlcohol: false });
    seen.add(line);
    // Ни одного «вы»: мы не знаем, сколько человек ходил и пил.
    assert.doesNotMatch(line, /вы прошли|вам не хватило|вы выпили|вы мало/i, line);
  }
  assert.ok(seen.size >= 3, "один и тот же хвост каждую неделю перестаёт читаться");
});

test("про алкоголь говорим, только если он был в записях, и без оценки", () => {
  assert.ok(!habitReminders({ periodIndex: 0, hadAlcohol: false }).includes(ALCOHOL_LINE));
  assert.ok(habitReminders({ periodIndex: 0, hadAlcohol: true }).includes(ALCOHOL_LINE));
  assert.doesNotMatch(ALCOHOL_LINE, /слишком|много|бросьте|вредн|стоит меньше/i);
});

test("разделы не создаются пустыми", () => {
  assert.deepEqual(insightSections(null, []), []);
  const onlyHabits = insightSections(null, ["Пейте воду."]);
  assert.equal(onlyHabits.length, 1);
  assert.equal(onlyHabits[0].title, "Вокруг еды");

  const full = insightSections({ observation: "Ровно.", dishNotes: ["Гречка."] }, ["Вода."]);
  assert.deepEqual(full.map((s) => s.title), ["Что заметно", "Вокруг еды"]);
  assert.match(full[0].text, /• Гречка\./);
});
