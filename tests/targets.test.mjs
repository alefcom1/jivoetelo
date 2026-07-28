import test from "node:test";
import assert from "node:assert/strict";
import { computeTargets } from "../lib/targets.ts";

const base = {
  goal: "maintain",
  sexForFormula: "female",
  birthYear: 1990,
  heightCm: 168,
  weightKg: 65,
  activity: "light",
};

test("поддержание: диапазон вокруг TDEE по Миффлину-Сан Жеору", () => {
  // BMR = 10*65 + 6.25*168 - 5*36 - 161 = 650 + 1050 - 180 - 161 = 1359
  // TDEE = 1359 * 1.375 = 1868.6; диапазон ±7%: 1740–2000 (окр. до 10)
  const t = computeTargets(base, 2026);
  assert.equal(t.kcalMin, 1740);
  assert.equal(t.kcalMax, 2000);
  assert.equal(t.proteinTarget, 104); // 1.6 г/кг
  assert.equal(t.fiberTarget, 25);
  assert.equal(t.adjusted, false);
});

test("снижение веса даёт мягкий дефицит ~15%", () => {
  const maintain = computeTargets(base, 2026);
  const lose = computeTargets({ ...base, goal: "lose" }, 2026);
  assert.ok(lose.kcalMax < maintain.kcalMin, "дефицит должен опускать весь диапазон");
  const ratio = lose.kcalMin / maintain.kcalMin;
  assert.ok(ratio > 0.8 && ratio < 0.9, `ожидали ~0.85, получили ${ratio}`);
});

test("мужская формула даёт больше энергии при прочих равных", () => {
  const female = computeTargets(base, 2026);
  const male = computeTargets({ ...base, sexForFormula: "male" }, 2026);
  assert.ok(male.kcalMin > female.kcalMin);
});

test("безопасность: цель не опускается ниже жёсткого пола", () => {
  const t = computeTargets(
    { goal: "lose", sexForFormula: "female", birthYear: 1950, heightCm: 150, weightKg: 42, activity: "sedentary" },
    2026,
  );
  assert.ok(t.kcalMin >= 1200 * 0.93, `нижняя граница слишком низкая: ${t.kcalMin}`);
  assert.equal(t.adjusted, true);
});

test("безопасность: несовершеннолетним не выдаётся дефицит", () => {
  const minor = computeTargets({ ...base, birthYear: 2010, goal: "lose" }, 2026);
  const minorMaintain = computeTargets({ ...base, birthYear: 2010, goal: "maintain" }, 2026);
  assert.equal(minor.kcalMin, minorMaintain.kcalMin);
  assert.equal(minor.adjusted, true);
});
