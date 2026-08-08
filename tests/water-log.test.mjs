import test from "node:test";
import assert from "node:assert/strict";
import {
  drinkGoalMl,
  estimateFoodWaterMl,
  formatMl,
  QUICK_ADDS,
  sumMl,
  waterNote,
} from "../lib/water-log.ts";
import { FOOD_WATER_SHARE } from "../lib/water.ts";

test("сумма за день складывает записи, а пустой день даёт ноль", () => {
  assert.equal(sumMl([]), 0);
  assert.equal(sumMl([{ id: 1, ml: 250 }, { id: 2, ml: 200 }, { id: 3, ml: 500 }]), 950);
});

// ─── Вода из еды ───────────────────────────────────────────────────────────
// Проверка не на выдуманных числах, а на справочных продуктах: метод «остаток
// от 100 г» обязан сходиться с таблицами, иначе строка «с едой пришло ≈» —
// красивая выдумка. Допуск 2 п.п. — на золу, которую мы берём константой.

/** Доля воды в 100 г по оценке модуля, в процентах. */
function waterPercent(per100) {
  return estimateFoodWaterMl([{ grams: 100, ...per100 }]);
}

test("оценка воды сходится со справочными значениями продуктов", () => {
  const cases = [
    { name: "огурец", per100: { proteinPer100: 0.8, fatPer100: 0.1, carbsPer100: 2.5, fiberPer100: 1 }, real: 95 },
    { name: "борщ", per100: { proteinPer100: 1.5, fatPer100: 2.5, carbsPer100: 5, fiberPer100: 1 }, real: 89 },
    { name: "гречка отварная", per100: { proteinPer100: 3.6, fatPer100: 1.1, carbsPer100: 19.9, fiberPer100: 2.7 }, real: 73 },
    { name: "хлеб ржаной", per100: { proteinPer100: 8, fatPer100: 1, carbsPer100: 48, fiberPer100: 2.4 }, real: 40 },
    { name: "сливочное масло", per100: { proteinPer100: 0.8, fatPer100: 82.5, carbsPer100: 0.8, fiberPer100: 0 }, real: 16 },
  ];
  for (const { name, per100, real } of cases) {
    const estimate = waterPercent(per100);
    assert.ok(
      Math.abs(estimate - real) <= 2,
      `${name}: оценка ${estimate} мл на 100 г против справочных ${real} — расхождение больше двух пунктов`,
    );
  }
});

test("у растительного масла и сахара воды нет, и в минус оценка не уходит", () => {
  assert.equal(waterPercent({ proteinPer100: 0, fatPer100: 99.9, carbsPer100: 0, fiberPer100: 0 }), 0);
  assert.equal(waterPercent({ proteinPer100: 0, fatPer100: 0, carbsPer100: 99.8, fiberPer100: 0 }), 0);
});

test("позиция без макронутриентов не считается за чистую воду", () => {
  // Все нули — это «не разобрали», а не «одна вода». Остаток дал бы 99 мл на
  // 100 г и тихо завысил бы день у каждого, кто записал еду без БЖУ.
  assert.equal(estimateFoodWaterMl([{ grams: 300, proteinPer100: 0, fatPer100: 0, carbsPer100: 0, fiberPer100: 0 }]), 0);
});

test("вода считается пропорционально порции и суммируется по позициям", () => {
  const cucumber = { proteinPer100: 0.8, fatPer100: 0.1, carbsPer100: 2.5, fiberPer100: 1 };
  const half = estimateFoodWaterMl([{ grams: 50, ...cucumber }]);
  const whole = estimateFoodWaterMl([{ grams: 100, ...cucumber }]);
  // Не строгое равенство: результат округляется до целых миллилитров, и
  // половина порции округляется своим шагом. Миллилитр расхождения здесь —
  // свойство округления, а не ошибка расчёта.
  assert.ok(Math.abs(half * 2 - whole) <= 1, `${half} × 2 против ${whole}`);

  // Две позиции складываются до округления, а не после: сумма округляется
  // один раз, поэтому от удвоенного отдельного результата она тоже может
  // отличаться на миллилитр.
  const together = estimateFoodWaterMl([{ grams: 100, ...cucumber }, { grams: 100, ...cucumber }]);
  assert.ok(Math.abs(together - whole * 2) <= 1, `${together} против ${whole * 2}`);
});

test("позиции с нулевым или отрицательным весом пропускаются", () => {
  const soup = { proteinPer100: 1.5, fatPer100: 2.5, carbsPer100: 5, fiberPer100: 1 };
  assert.equal(estimateFoodWaterMl([{ grams: 0, ...soup }]), 0);
  assert.equal(estimateFoodWaterMl([{ grams: -100, ...soup }]), 0);
});

test("на обычном дне доля воды из еды попадает в диапазон EFSA", () => {
  // 20–30% от всей воды — то, на чём стоит и константа FOOD_WATER_SHARE в
  // расчёте нормы. Если оценка по реальной еде систематически выпадает из
  // этого коридора, расходятся две части одного продукта.
  const day = [
    { grams: 250, proteinPer100: 3.6, fatPer100: 1.1, carbsPer100: 19.9, fiberPer100: 2.7 }, // каша
    { grams: 300, proteinPer100: 1.5, fatPer100: 2.5, carbsPer100: 5, fiberPer100: 1 },      // суп
    { grams: 150, proteinPer100: 20, fatPer100: 5, carbsPer100: 0, fiberPer100: 0 },          // курица
    { grams: 200, proteinPer100: 0.8, fatPer100: 0.1, carbsPer100: 2.5, fiberPer100: 1 },     // овощи
    { grams: 100, proteinPer100: 8, fatPer100: 1, carbsPer100: 48, fiberPer100: 2.4 },        // хлеб
  ];
  const foodMl = estimateFoodWaterMl(day);
  const totalWater = 2000;
  const share = foodMl / totalWater;
  assert.ok(share > 0.2 && share < 0.45, `доля воды из еды ${(share * 100).toFixed(0)}% выпала из ожидаемого коридора`);
  assert.ok(FOOD_WATER_SHARE > 0.2 && FOOD_WATER_SHARE < 0.3);
});

// ─── Ориентир ──────────────────────────────────────────────────────────────

test("без профиля ориентира нет, а не «два литра всем»", () => {
  assert.equal(drinkGoalMl(null), null);
});

test("ориентир по напиткам меньше общей воды и растёт с расходом", () => {
  const small = drinkGoalMl({ sex: "female", weightKg: 55, tdeeKcal: 1800 });
  const large = drinkGoalMl({ sex: "male", weightKg: 95, tdeeKcal: 2900 });
  assert.ok(small !== null && large !== null);
  assert.ok(large > small, "у человека с большим расходом ориентир обязан быть выше");
  // Пить нужно меньше, чем «вся вода»: разницу закрывает еда.
  assert.ok(small < 2000, "ориентир по напиткам не должен совпадать с общей нормой EFSA");
});

// ─── Подписи ───────────────────────────────────────────────────────────────

test("подпись не ругает за недобор и не пугает за перебор", () => {
  const under = waterNote(500, 1500, 600);
  assert.match(under, /До ориентира/);
  assert.ok(!/должн|обязан|мало|плохо/i.test(under), `в подписи о недоборе появилось давление: ${under}`);

  const over = waterNote(2500, 1500, 600);
  assert.ok(!/больше нормы|перебор|слишком/i.test(over), `в подписи о переборе появился упрёк: ${over}`);
});

test("подпись всегда называет воду из еды и оговаривает жару", () => {
  const note = waterNote(800, 1500, 640);
  assert.match(note, /с едой/i);
  assert.match(note, /640 мл/);
  assert.match(note, /жар/i);
});

test("без ориентира подпись объясняет, почему числа нет", () => {
  const note = waterNote(750, null, 0);
  assert.match(note, /план/i);
  assert.ok(!/мл\b.*до ориентира/i.test(note));
});

test("формат: миллилитры до литра, дальше литры с одной десятой", () => {
  assert.equal(formatMl(250), "250 мл");
  assert.equal(formatMl(999), "999 мл");
  assert.equal(formatMl(1000), "1 л");
  assert.equal(formatMl(1500), "1,5 л");
  assert.equal(formatMl(1740), "1,7 л");
  assert.equal(formatMl(2000), "2 л");
});

test("быстрые кнопки — бытовые меры, а не круглые числа наугад", () => {
  assert.equal(QUICK_ADDS.length, 3);
  for (const preset of QUICK_ADDS) {
    assert.ok(preset.ml >= 100 && preset.ml <= 500);
    assert.ok(preset.label.length > 0);
  }
});
