import assert from "node:assert/strict";
import { test } from "node:test";
import { dayGap } from "../lib/day-gap.ts";
import { buildCandidates, pickCandidates } from "../lib/suggest-candidates.ts";

const TARGETS = {
  kcalTarget: 1870, kcalMin: 1740, kcalMax: 2000,
  proteinTarget: 104, fiberTarget: 25, adjusted: false,
};

/** Съедено полдня: белка сильно не хватает, энергии ещё много. */
const HALF_DAY = { kcal: 900, protein: 35, fat: 35, carbs: 110, fiber: 8 };

test("кандидаты собираются из блюд, пар и одиночных продуктов", () => {
  const all = buildCandidates();
  assert.ok(all.length > 100, `кандидатов всего ${all.length}`);
  assert.ok(all.some((c) => c.title === "Борщ"), "блюда каталога не попали");
  assert.ok(all.some((c) => c.baseNames.length === 2), "пар нет");
  assert.ok(all.some((c) => c.title === "Яблоко"), "одиночных продуктов нет");
});

test("у каждого кандидата положительная порция и непустое название", () => {
  for (const c of buildCandidates()) {
    assert.ok(c.title.trim().length > 0, "пустое название");
    assert.ok(c.portion.kcal > 0, `${c.title}: ноль калорий`);
    assert.ok(c.baseNames.length > 0, `${c.title}: нет основы`);
  }
});

test("при нехватке белка вперёд выходит белковое", () => {
  const gap = dayGap(TARGETS, HALF_DAY);
  const picked = pickCandidates(gap);
  assert.equal(picked.length, 3);
  // Лучший вариант обязан реально закрывать дефицит, а не просто существовать.
  assert.ok(picked[0].closesProtein >= 20, `лучший закрывает ${picked[0].closesProtein} г белка`);
});

test("варианты не повторяют одну основу", () => {
  // Иначе тройка вырождается в «курица с гречкой», «курица с рисом»,
  // «курица с булгуром» — формально три, по сути один.
  const picked = pickCandidates(dayGap(TARGETS, HALF_DAY));
  const bases = picked.map((p) => p.baseNames[0]);
  assert.equal(new Set(bases).size, bases.length, `основы повторились: ${bases.join(", ")}`);
});

test("съеденное сегодня не предлагается снова", () => {
  const gap = dayGap(TARGETS, HALF_DAY);
  const without = pickCandidates(gap);
  const base = without[0].baseNames[0];
  // В дневнике запись называется не ровно как основа — проверяем вхождение.
  const after = pickCandidates(gap, { exclude: [`${base} с овощами`] });
  assert.ok(
    !after.some((p) => p.baseNames.includes(base)),
    `${base} предложен снова, хотя уже съеден`,
  );
});

test("к концу дня, когда осталось мало, предлагается лёгкое", () => {
  // Съедено почти всё: остаток до верхней границы — около 150 ккал.
  const tight = dayGap(TARGETS, { kcal: 1850, protein: 90, fat: 60, carbs: 210, fiber: 20 });
  const picked = pickCandidates(tight);
  for (const p of picked) {
    assert.ok(p.portion.kcal < 600, `${p.title}: ${Math.round(p.portion.kcal)} ккал при почти закрытом дне`);
  }
});

test("в начале дня варианты сытнее, чем в конце", () => {
  const morning = pickCandidates(dayGap(TARGETS, { kcal: 200, protein: 10, fat: 8, carbs: 25, fiber: 2 }));
  const evening = pickCandidates(dayGap(TARGETS, { kcal: 1800, protein: 95, fat: 62, carbs: 200, fiber: 22 }));
  const avg = (list) => list.reduce((s, p) => s + p.portion.kcal, 0) / list.length;
  assert.ok(avg(morning) > avg(evening), `утро ${Math.round(avg(morning))}, вечер ${Math.round(avg(evening))}`);
});

test("«показать другие» даёт другие варианты", () => {
  const gap = dayGap(TARGETS, HALF_DAY);
  const first = pickCandidates(gap).map((p) => p.title);
  const second = pickCandidates(gap, { offset: 3 }).map((p) => p.title);
  assert.equal(second.filter((t) => first.includes(t)).length, 0, `повторы: ${second.join(", ")}`);
});

test("подбор устойчив к закрытому дню и ничего не ломает", () => {
  // Всё добрано и перебрано: дефицитов нет, остаток нулевой.
  const closed = dayGap(TARGETS, { kcal: 2100, protein: 120, fat: 70, carbs: 240, fiber: 30 });
  const picked = pickCandidates(closed);
  assert.equal(picked.length, 3, "подбор молча опустел");
  for (const p of picked) {
    assert.equal(p.closesProtein, 0);
    assert.equal(p.closesFiber, 0);
  }
});

test("при нехватке клетчатки в тройке появляется что-то с клетчаткой", () => {
  // Белок добран, клетчатки сильно не хватает — подбор обязан это заметить.
  const gap = dayGap(TARGETS, { kcal: 1200, protein: 104, fat: 45, carbs: 130, fiber: 3 });
  const picked = pickCandidates(gap);
  assert.ok(
    picked.some((p) => p.closesFiber >= 3),
    `никто не закрывает клетчатку: ${picked.map((p) => `${p.title} (${p.closesFiber})`).join(", ")}`,
  );
});

test("в тройке не повторяется ни одна составляющая, включая гарнир", () => {
  // Проверки одной только основы недостаточно: она пропускает зеркальный
  // случай «курица с булгуром, индейка с булгуром, чечевица с булгуром» —
  // три разных белка при одном гарнире. Это и вылезло на живом прогоне.
  for (const eaten of [
    { kcal: 350, protein: 18, fat: 12, carbs: 45, fiber: 4 },
    { kcal: 900, protein: 35, fat: 35, carbs: 110, fiber: 8 },
    { kcal: 1850, protein: 95, fat: 62, carbs: 205, fiber: 22 },
  ]) {
    const picked = pickCandidates(dayGap(TARGETS, eaten));
    const parts = picked.flatMap((p) => p.baseNames);
    assert.equal(new Set(parts).size, parts.length, `повтор составляющей: ${parts.join(", ")}`);
  }
});
