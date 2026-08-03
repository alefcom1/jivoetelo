import assert from "node:assert/strict";
import { test } from "node:test";
import { dayGap, explain, openGaps, scoreCandidate } from "../lib/day-gap.ts";

const TARGETS = {
  kcalTarget: 1870,
  kcalMin: 1740,
  kcalMax: 2000,
  proteinTarget: 104,
  fiberTarget: 25,
  adjusted: false,
};

const EMPTY = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };

test("остаток считается по всем пяти величинам", () => {
  const gap = dayGap(TARGETS, EMPTY);
  assert.equal(gap.kcalLeft, 1870);
  assert.equal(gap.kcalLeftMax, 2000);
  assert.equal(gap.proteinGap, 104);
  assert.equal(gap.fiberGap, 25);
  // Жир и углеводы выводятся из калорий и белка (lib/macro-split.ts), но в
  // остатке присутствовать обязаны: раньше подбор о них не знал вовсе.
  assert.ok(gap.fatLeft > 0, "жир не попал в остаток");
  assert.ok(gap.carbsLeft > 0, "углеводы не попали в остаток");
});

test("перебор не уводит остаток в минус", () => {
  const gap = dayGap(TARGETS, { kcal: 2500, protein: 150, fat: 90, carbs: 300, fiber: 40 });
  for (const [key, value] of Object.entries(gap)) {
    assert.ok(value >= 0, `${key} ушёл в минус: ${value}`);
  }
});

test("недобор жира и углеводов дефицитом не считается", () => {
  // Ключевое продуктовое решение: жиры и углеводы — остаток, а не цель.
  // «Доберите углеводов» — это числовой перфекционизм, которого в продукте
  // быть не должно.
  const gap = dayGap(TARGETS, { kcal: 1800, protein: 104, fat: 10, carbs: 20, fiber: 25 });
  assert.deepEqual(openGaps(gap), []);
});

test("мелкий недобор не считается дефицитом", () => {
  // «Не хватает 2 г белка» человек не закроет осмысленным действием.
  const gap = dayGap(TARGETS, { kcal: 1800, protein: 100, fat: 60, carbs: 200, fiber: 23 });
  assert.deepEqual(openGaps(gap), []);
});

test("заметный недобор белка и клетчатки виден", () => {
  const gap = dayGap(TARGETS, { kcal: 1200, protein: 40, fat: 40, carbs: 150, fiber: 8 });
  assert.deepEqual(openGaps(gap), ["protein", "fiber"]);
});

test("закрытие дефицита считается с отсечением", () => {
  // Порция на 60 г белка при недоборе 20 закрывает двадцать, а не шестьдесят.
  // Иначе подбор скатывается к «чем больше белка, тем лучше».
  const gap = dayGap(TARGETS, { kcal: 1500, protein: 84, fat: 50, carbs: 180, fiber: 20 });
  const score = scoreCandidate(gap, { kcal: 300, protein: 60, fat: 5, carbs: 10, fiber: 2 });
  assert.equal(gap.proteinGap, 20);
  assert.equal(score.closesProtein, 20);
});

test("вариант, закрывающий дефицит, обходит пустой по калориям", () => {
  const gap = dayGap(TARGETS, { kcal: 1400, protein: 50, fat: 45, carbs: 160, fiber: 10 });
  const tvorog = scoreCandidate(gap, { kcal: 180, protein: 26, fat: 7, carbs: 3, fiber: 0 });
  const konfeta = scoreCandidate(gap, { kcal: 180, protein: 1, fat: 9, carbs: 24, fiber: 0 });
  assert.ok(tvorog.score > konfeta.score, `творог ${tvorog.score} против конфеты ${konfeta.score}`);
});

test("выход за верхнюю границу коридора наказывается", () => {
  const gap = dayGap(TARGETS, { kcal: 1850, protein: 60, fat: 60, carbs: 200, fiber: 15 });
  // Остаток до kcalMax — 150 ккал.
  const fits = scoreCandidate(gap, { kcal: 140, protein: 20, fat: 4, carbs: 5, fiber: 3 });
  const huge = scoreCandidate(gap, { kcal: 700, protein: 20, fat: 4, carbs: 5, fiber: 3 });
  assert.equal(fits.overshootKcal, 0);
  assert.ok(huge.overshootKcal > 500, `перебор ${huge.overshootKcal}`);
  assert.ok(fits.score > huge.score, "перебор не наказан");
});

test("одинаковую пользу при меньшей цене предпочитаем", () => {
  const gap = dayGap(TARGETS, { kcal: 1000, protein: 40, fat: 30, carbs: 120, fiber: 10 });
  const light = scoreCandidate(gap, { kcal: 200, protein: 25, fat: 3, carbs: 5, fiber: 2 });
  const heavy = scoreCandidate(gap, { kcal: 600, protein: 25, fat: 3, carbs: 5, fiber: 2 });
  assert.ok(light.score > heavy.score, `лёгкий ${light.score}, тяжёлый ${heavy.score}`);
});

test("грубый выход по жиру наказывается, умеренный — нет", () => {
  const gap = dayGap(TARGETS, { kcal: 1200, protein: 60, fat: 50, carbs: 150, fiber: 12 });
  const normal = scoreCandidate(gap, { kcal: 300, protein: 20, fat: 10, carbs: 10, fiber: 3 });
  const oily = scoreCandidate(gap, { kcal: 300, protein: 20, fat: 80, carbs: 10, fiber: 3 });
  assert.ok(oily.score < normal.score, "жирный вариант не наказан");
  // Но наказание ограничено: жир — не грех, а остаток.
  assert.ok(normal.score - oily.score <= 0.4, "штраф за жир слишком велик");
});

test("объяснение говорит только о том, что действительно закрывается", () => {
  const gap = dayGap(TARGETS, { kcal: 1400, protein: 60, fat: 45, carbs: 160, fiber: 20 });
  const score = scoreCandidate(gap, { kcal: 200, protein: 28, fat: 6, carbs: 4, fiber: 0 });
  const text = explain(score, true, 200);
  assert.match(text, /белка/);
  assert.doesNotMatch(text, /клетчатк/, "клетчатка упомянута, хотя её вариант не даёт");
  assert.doesNotMatch(text, /жир|углевод/, "жиры или углеводы попали в текст");
});

test("со скрытыми калориями в объяснении нет калорий", () => {
  const gap = dayGap(TARGETS, { kcal: 1400, protein: 60, fat: 45, carbs: 160, fiber: 20 });
  const score = scoreCandidate(gap, { kcal: 200, protein: 28, fat: 6, carbs: 4, fiber: 0 });
  assert.doesNotMatch(explain(score, false, 200), /ккал/);
});

test("когда закрывать нечего, объяснение не выдумывает пользу", () => {
  const gap = dayGap(TARGETS, { kcal: 1000, protein: 104, fat: 40, carbs: 140, fiber: 25 });
  const score = scoreCandidate(gap, { kcal: 200, protein: 5, fat: 6, carbs: 30, fiber: 1 });
  const text = explain(score, true, 200);
  assert.doesNotMatch(text, /закроет/);
  assert.match(text, /остаток/);
});
