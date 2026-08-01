import test from "node:test";
import assert from "node:assert/strict";
import { angleFor, buildPrompt, validateSuggestions, SUGGEST_ANGLES } from "../lib/ai/suggest.ts";
import { MealAnalysisError } from "../lib/ai/types.ts";

test("валидные варианты проходят, лишние отбрасываются до трёх", () => {
  const s = { title: "Творог с ягодами", why: "Быстро и много белка.", approxKcal: 250, approxProtein: 28, timeMinutes: 3 };
  const result = validateSuggestions({ suggestions: [s, s, s, s, s] });
  assert.equal(result.length, 3);
  assert.equal(result[0].title, "Творог с ягодами");
});

test("значения зажимаются, мусор отбрасывается", () => {
  const result = validateSuggestions({
    suggestions: [
      { title: "Суп", why: "Тёплый вариант.", approxKcal: 99999, approxProtein: -5, timeMinutes: "долго" },
      { title: "", why: "без названия" },
      null,
    ],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].approxKcal, 2000);
  assert.equal(result[0].approxProtein, 0);
  assert.equal(result[0].timeMinutes, 0);
});

test("пустой список — ошибка invalid_output", () => {
  assert.throws(
    () => validateSuggestions({ suggestions: [] }),
    (error) => error instanceof MealAnalysisError && error.reason === "invalid_output",
  );
});

/**
 * Запрос к модели — единственное место, где дневник человека превращается в
 * текст. Раньше в него уходили только числа остатка, и подсказки выдумывали
 * блюда с нуля, ничего не зная о том, что человек вообще ест.
 */

const BASE = {
  remainingKcal: 800,
  remainingProtein: 40,
  remainingFiber: 12,
  mealTypeLabel: "Ужин",
  showCalories: true,
  usualMeals: [],
  eatenToday: [],
  round: 0,
};

test("дневник и съеденное сегодня попадают в запрос", () => {
  const prompt = buildPrompt({
    ...BASE,
    usualMeals: ["Гречка, курица", "Творог, груша"],
    eatenToday: ["Овсяная каша", "Черника"],
  });
  assert.match(prompt, /Гречка, курица; Творог, груша/);
  assert.match(prompt, /Овсяная каша, Черника/);
});

test("у новичка запрос не врёт про привычки", () => {
  // Пустой дневник — не повод писать «человек ел: » с пустым хвостом: модель
  // приняла бы это за факт и стала бы подстраиваться под пустоту.
  const prompt = buildPrompt(BASE);
  assert.ok(!prompt.includes("Из дневника"), prompt);
  assert.ok(!prompt.includes("уже съедено"), prompt);
  assert.match(prompt, /Следующий приём пищи: Ужин/);
});

test("дневник подан как дневник, а не как привычка", () => {
  // Часть строк — разовые записи (см. repeatableMeals): точные повторы на
  // снимках редки. Назвать их «обычно ест» значило бы сообщить модели факт,
  // которого нет, и получить подсказки под выдуманный уклад.
  const prompt = buildPrompt({ ...BASE, usualMeals: ["Плов"] });
  assert.ok(!prompt.includes("обычно ест"), prompt);
  assert.match(prompt, /в последние недели/);
});

test("скрытые калории — отдельная строка, и только когда они скрыты", () => {
  assert.ok(!buildPrompt(BASE).includes("скрыл калории"));
  assert.match(buildPrompt({ ...BASE, showCalories: false }), /скрыл калории/);
});

/**
 * Разнообразие. «Показать другие» выдавало то же самое: омлет, творог,
 * гречка с курицей — каждый раз, с точностью до перестановки слов. Дело было
 * не в температуре модели, а в том, что запрос не менялся вовсе.
 */

test("первый заход идёт без дополнительных условий", () => {
  // Человек ещё ничего не видел — сужать подбор не за что.
  assert.equal(angleFor(0), "");
  assert.equal(buildPrompt(BASE).includes("В этот раз"), false);
});

test("каждое следующее нажатие меняет запрос", () => {
  const prompts = [0, 1, 2, 3, 4, 5].map((round) => buildPrompt({ ...BASE, round }));
  assert.equal(new Set(prompts).size, prompts.length, "нашлись два одинаковых запроса");
});

test("углы не пересекаются между собой", () => {
  const angles = SUGGEST_ANGLES.filter(Boolean);
  assert.equal(new Set(angles).size, angles.length, "повтор формулировки среди углов");
  assert.ok(angles.length >= 4, "меньше четырёх углов — круг замкнётся слишком быстро");
});

test("круг замыкается, а не уходит в пустоту", () => {
  // Нажимать «Показать другие» можно сколько угодно, и на седьмой раз мы
  // возвращаемся к началу — это лучше, чем перестать что-либо менять.
  assert.equal(angleFor(SUGGEST_ANGLES.length), angleFor(0));
  assert.equal(angleFor(SUGGEST_ANGLES.length + 2), angleFor(2));
});

test("испорченный номер захода не ломает запрос", () => {
  // Число приходит от клиента: оно безобидно по сути, но упасть на нём
  // подбор всё равно не должен.
  for (const round of [-5, 1.7, NaN, Infinity]) {
    assert.equal(typeof angleFor(round), "string", `сломались на ${round}`);
  }
  assert.equal(angleFor(-5), angleFor(0));
});

test("угол не вытесняет остаток дня из запроса", () => {
  // Он уточняет уже поставленную задачу, а не заменяет её: без остатка
  // подбор перестанет попадать в норму.
  const prompt = buildPrompt({ ...BASE, round: 2 });
  assert.match(prompt, /Остаток на сегодня/);
  assert.match(prompt, /Следующий приём пищи/);
  assert.ok(prompt.endsWith(SUGGEST_ANGLES[2]), "угол должен идти последней строкой");
});
