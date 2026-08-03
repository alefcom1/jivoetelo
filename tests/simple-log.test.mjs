import test from "node:test";
import assert from "node:assert/strict";
import { FOOD_REFERENCE } from "../lib/food-reference.ts";
import { atwaterKcal } from "../lib/nutrition-sanity.ts";
import {
  buildSimpleMeal,
  isPlatePart,
  isPortionSize,
  PLATE_PARTS,
  PORTION_FACTORS,
  PORTION_LABELS,
  simpleKcalRange,
} from "../lib/simple-log.ts";

test("числа частей тарелки сходятся по Атуотеру", () => {
  // Та же проверка, что у справочника: опечатка в разряде (310 вместо 31 г
  // белка) иначе разошлась бы по всем записям упрощённого режима сразу.
  for (const part of PLATE_PARTS) {
    const computed = atwaterKcal({
      protein: part.proteinPer100, fat: part.fatPer100,
      carbs: part.carbsPer100, fiber: part.fiberPer100, alcohol: 0,
    });
    const ratio = computed / part.kcalPer100;
    assert.ok(ratio > 0.75 && ratio < 1.25, `${part.label}: по БЖУ ${computed.toFixed(0)} против ${part.kcalPer100} (${ratio.toFixed(2)})`);
  }
});

test("части тарелки не выдуманы: у каждой есть прообраз в справочнике", () => {
  // Смысл в том, что упрощённый режим не заводит собственной таблицы еды.
  // Разойдись они — один и тот же обед дал бы разные калории в зависимости
  // от того, каким способом его записали.
  for (const part of PLATE_PARTS) {
    const close = FOOD_REFERENCE.some((food) => Math.abs(food.kcal - part.kcalPer100) <= part.kcalPer100 * 0.15);
    assert.ok(close, `${part.label}: ${part.kcalPer100} ккал не похоже ни на одну позицию справочника`);
  }
});

test("порции: меньше — не половина, больше — не двойная", () => {
  // Ровные 0,5 и 2 выглядят убедительнее, чем есть на самом деле, и ошибка
  // на них выходит вдвое больше.
  assert.ok(PORTION_FACTORS.less > 0.5 && PORTION_FACTORS.less < 1);
  assert.equal(PORTION_FACTORS.usual, 1);
  assert.ok(PORTION_FACTORS.more > 1 && PORTION_FACTORS.more < 2);
  for (const key of Object.keys(PORTION_FACTORS)) {
    assert.equal(typeof PORTION_LABELS[key], "string", `нет подписи для ${key}`);
  }
});

test("тарелка превращается в позиции дневника", () => {
  const items = buildSimpleMeal({ parts: ["protein", "vegetable"], portion: "usual" });
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((i) => i.name), ["Белковое блюдо", "Овощи"]);
  assert.ok(items.every((i) => i.grams > 0));
});

test("уверенность всегда «неточно»", () => {
  // Человек не называл ни продукта, ни веса. Пометить такую запись точной
  // значит соврать в единственном месте, где интерфейс говорит о точности.
  for (const portion of ["less", "usual", "more"]) {
    const items = buildSimpleMeal({ parts: ["protein", "grain", "fat"], portion });
    assert.ok(items.every((i) => i.confidence === "low"), `порция ${portion}`);
  }
});

test("порция меняет вес, но не состав", () => {
  const less = buildSimpleMeal({ parts: ["grain"], portion: "less" });
  const usual = buildSimpleMeal({ parts: ["grain"], portion: "usual" });
  const more = buildSimpleMeal({ parts: ["grain"], portion: "more" });
  assert.ok(less[0].grams < usual[0].grams && usual[0].grams < more[0].grams);
  assert.equal(less[0].kcalPer100, usual[0].kcalPer100, "значения на 100 г от размера порции не зависят");
});

test("порядок позиций не зависит от порядка нажатий", () => {
  // Иначе один и тот же обед выглядел бы в дневнике по-разному.
  const a = buildSimpleMeal({ parts: ["vegetable", "protein"], portion: "usual" });
  const b = buildSimpleMeal({ parts: ["protein", "vegetable"], portion: "usual" });
  assert.deepEqual(a, b);
});

test("пустая тарелка даёт пустой список, а не запись из ничего", () => {
  assert.deepEqual(buildSimpleMeal({ parts: [], portion: "usual" }), []);
});

test("повтор одной части не удваивает её", () => {
  // Клиент прислать такое может — интерфейс это не даёт, но точке приёма
  // верить нельзя.
  const items = buildSimpleMeal({ parts: ["protein", "protein"], portion: "usual" });
  assert.equal(items.length, 1);
});

test("диапазон энергии, а не одно число", () => {
  const items = buildSimpleMeal({ parts: ["protein", "grain", "vegetable"], portion: "usual" });
  const { min, max } = simpleKcalRange(items);
  assert.ok(min > 0 && max > min, `${min}–${max}`);
  // Разброс заметный: точность, которой нет, читается как обещание.
  assert.ok(max / min > 1.5, `разброс слишком узкий: ${min}–${max}`);
});

test("значения из внешнего мира проверяются", () => {
  assert.ok(isPlatePart("protein"));
  assert.ok(!isPlatePart("пирожок"));
  assert.ok(!isPlatePart("__proto__"));
  assert.ok(isPortionSize("usual"));
  assert.ok(!isPortionSize("огромная"));
});

test("самая незаметная часть тарелки не забыта", () => {
  // Масло, соус и сыр — то, что чаще всего «не считается», а весит больше
  // всего: у жирного самая маленькая порция и самая высокая калорийность.
  const fat = PLATE_PARTS.find((p) => p.key === "fat");
  assert.ok(fat, "части «жирное» нет вовсе");
  assert.ok(fat.baseGrams <= 30, "порция жирного должна быть маленькой");
  assert.ok(fat.kcalPer100 >= 500, "иначе ложка масла потеряется в записи");
});
