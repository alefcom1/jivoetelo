import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFan, reachesTarget, TDEE_ERROR } from "../lib/fan.ts";
import { computeTdee } from "../lib/targets.ts";

/**
 * Веер — это то, что человек увидит вместо чужой линии «88 кг к 6 ноября».
 * Ошибка здесь не «некрасиво», а «мы пообещали не то»: перевёрнутые края
 * или незамеченное плато превратили бы честный жанр в такую же ложь, только
 * с заливкой.
 */

/** Тот же человек, что в разборе воронки конкурента: 50 лет, 185 см, 102 кг. */
const MAN = {
  sexForFormula: "male",
  birthYear: 1976,
  heightCm: 185,
  weightKg: 102,
  activity: "light",
  currentYear: 2026,
};

function fanFor(overrides = {}) {
  const input = { ...MAN, intakeKcal: 2100, targetWeightKg: 88, ...overrides };
  return buildFan(input);
}

test("медленный край действительно медленнее быстрого", () => {
  // Знак поправки к расходу легко перепутать, и веер тогда раскроется в
  // другую сторону, оставаясь внешне правдоподобным.
  const fan = fanFor();
  const last = (line) => line.points[line.points.length - 1];
  assert.ok(last(fan.fast) < last(fan.mid), "быстрый край должен уйти ниже среднего");
  assert.ok(last(fan.mid) < last(fan.slow), "средний край должен уйти ниже медленного");
});

test("веер расходится, а не идёт полосой равной ширины", () => {
  const fan = fanFor();
  const spread = (i) => fan.slow.points[i] - fan.fast.points[i];
  assert.equal(spread(0), 0, "в точке «сегодня» разброса нет — это факт, а не прогноз");
  assert.ok(spread(4) > 0.5, "через месяц края должны заметно разойтись");
  assert.ok(spread(20) > spread(4), "дальше разброс только растёт");
});

test("кривая выполаживается: расход падает вместе с весом", () => {
  // Главное отличие от «дефицит × недели ÷ 7700». Если этого нет, значит
  // симуляция считает по постоянному расходу и врёт тем сильнее, чем дальше.
  const fan = fanFor();
  const firstMonth = fan.mid.points[0] - fan.mid.points[4];
  const laterMonth = fan.mid.points[40] - fan.mid.points[44];
  assert.ok(firstMonth > laterMonth, "первый месяц обязан быть результативнее сорокового");
});

test("недостижимая цель называется недостижимой, а не отодвигается", () => {
  // Потребление почти на уровне расхода: вес встанет задолго до цели.
  const tdee = computeTdee(MAN, 2026);
  const fan = fanFor({ intakeKcal: Math.round(tdee) - 40, targetWeightKg: 70 });
  assert.equal(reachesTarget(fan), false);
  assert.equal(fan.weeksToTarget.slow, null);
  assert.ok(fan.plateauKg > 70, `плато должно быть выше цели, а не ${fan.plateauKg}`);
});

test("плато — это вес, на котором расход сравнялся с едой", () => {
  const fan = fanFor({ intakeKcal: 2100, targetWeightKg: undefined });
  const atPlateau = computeTdee({ ...MAN, weightKg: fan.plateauKg }, 2026);
  assert.ok(Math.abs(atPlateau - 2100) < 5, `на плато расход ${Math.round(atPlateau)} должен совпасть с 2100`);
});

test("средняя линия не уходит ниже плато", () => {
  const fan = fanFor({ targetWeightKg: undefined });
  const lowest = Math.min(...fan.mid.points);
  assert.ok(lowest >= fan.plateauKg - 0.5, `линия ушла ниже плато: ${lowest} против ${fan.plateauKg}`);
});

test("срок до цели — это вилка, а не число", () => {
  // Цель поближе, чтобы её достигали оба края: широкая вилка и есть смысл
  // веера, а узкая означала бы, что мы случайно занизили разброс и вернулись
  // к ложной точности.
  const fan = fanFor({ targetWeightKg: 95 });
  assert.ok(fan.weeksToTarget.fast !== null && fan.weeksToTarget.slow !== null);
  assert.ok(
    fan.weeksToTarget.fast < fan.weeksToTarget.slow,
    "быстрый край обязан прийти к цели раньше медленного",
  );
  assert.ok(
    fan.weeksToTarget.slow - fan.weeksToTarget.fast > 4,
    `вилка подозрительно узкая: ${fan.weeksToTarget.fast}–${fan.weeksToTarget.slow} недель`,
  );
});

test("медленный край может не дойти до цели — и это самый полезный ответ", () => {
  // Мужчина 50 лет, 185 см, 102 кг, цель 88 кг, ест 2100 ккал. Если формула
  // завысила его расход на 15%, вес встанет около 88,5 кг — то есть у самой
  // цели, не дойдя. Ни один конкурент такого не показывает: их линия просто
  // приходит в назначенную дату.
  //
  // Интерфейс обязан уметь это сказать словами, а не считать ошибкой ввода:
  // «при таком питании нижняя оценка останавливается чуть выше цели» —
  // полезнее любой даты.
  const fan = fanFor({ targetWeightKg: 88 });
  assert.equal(fan.weeksToTarget.fast !== null, true, "быстрый край до цели доходит");
  assert.equal(fan.weeksToTarget.slow, null, "а медленный — нет, и это надо показать");
});

test("без цели вилки нет, а траектория всё равно считается", () => {
  const fan = fanFor({ targetWeightKg: undefined });
  assert.equal(fan.weeksToTarget, null);
  assert.ok(fan.mid.points.length > 1);
});

test("поддержание держит вес ровно", () => {
  const tdee = computeTdee(MAN, 2026);
  const fan = buildFan({ ...MAN, intakeKcal: Math.round(tdee), targetWeightKg: undefined, weeks: 12 });
  const drift = Math.abs(fan.mid.points[12] - MAN.weightKg);
  assert.ok(drift < 0.5, `на поддержании вес не должен уезжать, а уехал на ${drift.toFixed(2)} кг`);
});

test("ширина веера задана одной величиной, а не рассыпана по коду", () => {
  // Если разброс однажды придётся уточнить, менять его надо в одном месте.
  assert.ok(TDEE_ERROR > 0 && TDEE_ERROR < 0.5);
});

test("горизонт расчёта ограничен и не растёт бесконечно", () => {
  const fan = buildFan({ ...MAN, intakeKcal: 2100, weeks: 500 });
  assert.ok(fan.mid.points.length <= 79, `слишком длинный прогноз: ${fan.mid.points.length} точек`);
});

test("плато медленного края считается отдельно от среднего", () => {
  // Подпись «если формула завысила ваш расход, вес остановится около N кг»
  // обязана называть плато именно медленного края. Первая версия брала
  // среднее — то есть приписывала одному сценарию число из другого.
  const fan = fanFor({ intakeKcal: 2100, targetWeightKg: undefined });
  assert.ok(
    fan.plateauSlowKg > fan.plateauKg,
    `медленный край останавливается выше среднего, а получилось ${fan.plateauSlowKg} против ${fan.plateauKg}`,
  );
});

test("рост веса по медленному краю замечается и называется", () => {
  // Сидячий образ жизни, «дефицитный» план: если формула завысила расход на
  // 15%, дефицита нет вовсе и вес медленно идёт вверх. Это надо сказать, а не
  // рисовать веер, у которого верхний край молча уползает вверх.
  const rising = buildFan({ ...MAN, activity: "sedentary", intakeKcal: 2010, targetWeightKg: 88 });
  assert.equal(rising.slowRises, true);
  assert.ok(rising.slow.points[30] > rising.slow.points[0], "верхний край действительно растёт");

  const falling = fanFor({ intakeKcal: 1900 });
  assert.equal(falling.slowRises, false);
});
