// Как утренний вес ведёт себя после дней с тем или иным блюдом.
//
// ## Что здесь измеряется — и что не измеряется
//
// НЕ «толстеете ли вы от блюда». Избыток в 500 ккал — это примерно 65 г
// жировой ткани (7700 ккал на килограмм), а шум одного взвешивания — 500–1000 г
// (вода, гликоген, натрий, содержимое кишечника, у женщин ещё и цикл). Сигнал
// меньше шума на порядок с лишним, и никакой выборки, доступной в жизни, на
// него не хватит. Модуль, который утверждал бы обратное, врал бы.
//
// Измеряется другое, проверяемое: **на сколько утренний замер отклоняется от
// собственного тренда человека после дней с блюдом по сравнению с днями без
// него, при равной калорийности дня**. Это вода, соль и гликоген. Эффект
// реальный, воспроизводимый и полезный — он объясняет, почему весы наутро
// после солёного ужина показывают +0,8 кг, и почему это не жир.
//
// Все формулировки, которые строятся поверх этого модуля, обязаны говорить
// именно так. «Блюдо повышает ваш вес» — утверждение, которого здесь нет.
//
// ## Почему пороги такие высокие
//
// Проверка на синтетике с НУЛЕВЫМ истинным эффектом (tests/weight-response.
// test.mjs) показывает, во что превращается этот расчёт без защиты: при
// двадцати блюдах и десятке замеров «значимая» находка появляется у половины
// пользователей, и величина её больше килограмма. Поэтому здесь одновременно:
// поправка на калорийность дня, эффективное N с оглядкой на автокорреляцию,
// поправка Бенджамини-Хохберга на множественные сравнения и минимальный размер
// эффекта. Снижать любой из порогов — значит возвращать генератор случайных
// находок.
//
// Модуль чистый: ни базы, ни `new Date()`.

import { shiftDay } from "./dates.ts";
import { weightTrend, type WeightPoint } from "./trend.ts";

/** День дневника — то, что человек съел, свёрнутое до нужного анализу. */
export type DayIntake = {
  day: string;
  kcal: number;
  mealCount: number;
  /** Канонические ключи блюд (lib/dish-key.ts), без повторов внутри дня. */
  keys: string[];
  /** Время последнего приёма пищи, «ЧЧ:ММ». null, если записей нет. */
  lastMealTime: string | null;
  hasAlcohol: boolean;
};

export type Observation = {
  /** День еды; замер относится к следующему утру. */
  day: string;
  /** W(d+1) − T(d): отклонение завтрашнего замера от сегодняшнего тренда. */
  deviationKg: number;
  kcal: number;
  keys: Set<string>;
};

export type Effect = {
  key: string;
  nWith: number;
  nWithout: number;
  /** Сдвиг относительно тренда, кг. Положительный — весы наутро выше. */
  deltaKg: number;
  ciLowKg: number;
  ciHighKg: number;
  pValue: number;
  /** Benjamini-Hochberg по всем проверенным ключам периода. */
  qValue: number;
  /** Прошёл все пороги — только такое показывается человеку. */
  reportable: boolean;
};

export type ImpactLevel = "none" | "descriptive" | "statistical";

export type ImpactReport = {
  level: ImpactLevel;
  usablePairs: number;
  daysLogged: number;
  /** Наклон «кг на 1000 ккал» — для объяснения метода, не для показа. */
  kcalSlopeKgPer1000: number | null;
  effects: Effect[];
  /** Сколько пар не хватает до следующего уровня. Это и есть текст «пока рано». */
  missingPairs: number;
};

// ─── Пороги ────────────────────────────────────────────────────────────────
/** Пар «день еды → замер наутро», ниже которых не показываем вообще ничего. */
export const MIN_PAIRS_DESCRIPTIVE = 12;
/** Пар, ниже которых нет статистики — только наблюдения без выводов. */
export const MIN_PAIRS_STATISTICAL = 40;
export const MIN_DAYS_LOGGED = 14;
export const MIN_N_WITH = 6;
export const MIN_N_WITHOUT = 6;
/**
 * Минимальный размер эффекта. Расчёт мощности при СКО отклонения 0,6 кг даёт
 * реально различимую величину около 0,5 кг на тех выборках, которые набираются
 * за два месяца. Статистически «значимые» 200 граммов — это шум, доживший до
 * порога значимости, а не находка.
 */
export const MIN_EFFECT_KG = 0.5;
export const Q_MAX = 0.1;

/** День без дневника — это неизвестность, а не «день без блюда». */
const MIN_MEALS_PER_DAY = 2;
const MIN_KCAL_PER_DAY = 800;
/** Скачок больше трёх килограммов между соседними днями — другие весы или опечатка. */
const MAX_PLAUSIBLE_JUMP_KG = 3;
/** После этого времени ужин считается поздним. */
const LATE_MEAL_FROM_MINUTES = 21 * 60 + 30;

export const FLAG_ALCOHOL = "flag:alcohol";
export const FLAG_LATE_MEAL = "flag:late_meal";

function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const value = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Признаки дня — сверх блюд.
 *
 * Заведены потому, что у них заведомо больше наблюдений, чем у любого
 * отдельного блюда, а физиология известна: алкоголь и поздний плотный ужин
 * задерживают воду. Сигнал по ним появляется на третьей-четвёртой неделе,
 * тогда как по конкретному блюду — на восьмой.
 */
function dayFlags(day: DayIntake): string[] {
  const flags: string[] = [];
  if (day.hasAlcohol) flags.push(FLAG_ALCOHOL);
  const last = day.lastMealTime ? minutesOf(day.lastMealTime) : null;
  if (last !== null && last >= LATE_MEAL_FROM_MINUTES) flags.push(FLAG_LATE_MEAL);
  return flags;
}

/**
 * Наблюдения по соседним дням.
 *
 * Только соседним: между замером в понедельник и в пятницу лежит четыре дня
 * еды, и приписать разницу одному ужину нельзя.
 *
 * База сравнения — причинный тренд из lib/trend.ts: прямой проход EWMA знает
 * только замеры по день `d` включительно. Считайся тренд по всей истории в обе
 * стороны, завтрашний вес попадал бы в собственную базу сравнения, и любая
 * находка была бы артефактом расчёта.
 *
 * Дни с неполным дневником выбрасываются, а НЕ зачисляются в контрольную
 * группу: пропуски у людей не случайны (не записывают как раз праздники и
 * дни, выбивающиеся из обычного), и зачесть такой день как «день без блюда»
 * значило бы систематически занижать эффект у самых интересных блюд.
 */
export function buildObservations(weights: WeightPoint[], intake: DayIntake[]): Observation[] {
  const trend = weightTrend(weights);
  const trendAt = new Map(trend.map((point) => [point.onDate, point.trendKg]));
  const weightAt = new Map(weights.map((entry) => [entry.onDate, entry.weightKg]));

  const out: Observation[] = [];
  for (const day of intake) {
    if (day.mealCount < MIN_MEALS_PER_DAY || day.kcal < MIN_KCAL_PER_DAY) continue;

    const trendToday = trendAt.get(day.day);
    const weightToday = weightAt.get(day.day);
    const weightTomorrow = weightAt.get(shiftDay(day.day, 1));
    if (trendToday === undefined || weightTomorrow === undefined) continue;
    if (weightToday !== undefined && Math.abs(weightTomorrow - weightToday) > MAX_PLAUSIBLE_JUMP_KG) continue;

    out.push({
      day: day.day,
      deviationKg: weightTomorrow - trendToday,
      kcal: day.kcal,
      keys: new Set([...day.keys, ...dayFlags(day)]),
    });
  }
  return out;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
}

/**
 * Убирает из отклонения то, что объясняется калорийностью дня.
 *
 * Без этого шага «блюдо» — просто прокси калорийности: пицца «повышает вес»
 * ровно потому, что в день с пиццей съедено на семьсот килокалорий больше, и
 * вывод про блюдо был бы ложным даже при верном направлении.
 *
 * Поправка неполная, и это надо помнить, читая результат: сам `kcal` оценён с
 * погрешностью до 30% (lib/confidence.ts), а шум в предикторе занижает наклон
 * регрессии. Часть калорийного эффекта останется в остатке.
 */
export function removeCalorieEffect(observations: Observation[]): { residuals: number[]; slope: number } {
  if (observations.length < 3) {
    return { residuals: observations.map((o) => o.deviationKg), slope: 0 };
  }
  const meanKcal = mean(observations.map((o) => o.kcal));
  const meanDev = mean(observations.map((o) => o.deviationKg));
  let sxy = 0;
  let sxx = 0;
  for (const o of observations) {
    sxy += (o.kcal - meanKcal) * (o.deviationKg - meanDev);
    sxx += (o.kcal - meanKcal) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanDev - slope * meanKcal;
  return {
    residuals: observations.map((o) => o.deviationKg - (intercept + slope * o.kcal)),
    slope,
  };
}

/** Автокорреляция лага 1 — мера того, насколько соседние дни повторяют друг друга. */
export function lag1Autocorrelation(values: number[]): number {
  if (values.length < 3) return 0;
  const m = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < values.length; i += 1) {
    denominator += (values[i] - m) ** 2;
    if (i > 0) numerator += (values[i] - m) * (values[i - 1] - m);
  }
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Эффективное число наблюдений при AR(1): неделя отпуска — это не семь
 * независимых дней, и считать её за семь значило бы завысить значимость.
 */
export function effectiveN(n: number, rho: number): number {
  const bounded = Math.min(0.9, Math.max(0, rho));
  return Math.max(2, (n * (1 - bounded)) / (1 + bounded));
}

// ─── Распределение Стьюдента ───────────────────────────────────────────────
// Реализуем сами: математических библиотек в зависимостях нет и заводить их
// ради двух функций незачем. Проверяется тестом против табличных значений.

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  const x = z - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i += 1) a += LANCZOS[i] / (x + i + 1);
  const t = x + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Непрерывная дробь для неполной бета-функции (метод Лентца). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let result = d;

  for (let m = 1; m <= 200; m += 1) {
    const m2 = 2 * m;
    let numerator = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    result *= d * c;

    numerator = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < 3e-12) break;
  }
  return result;
}

/** Регуляризованная неполная бета-функция I_x(a, b). */
function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (Math.exp(
        logGamma(a + b) - logGamma(a) - logGamma(b) + b * Math.log(1 - x) + a * Math.log(x),
      ) * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Функция распределения Стьюдента: P(T ≤ t) при df степенях свободы. */
export function studentTCdf(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return Number.NaN;
  const tail = 0.5 * incompleteBeta(df / 2, 0.5, df / (df + t * t));
  return t > 0 ? 1 - tail : tail;
}

/** Квантиль Стьюдента — обращением функции распределения делением пополам. */
export function studentTQuantile(p: number, df: number): number {
  let low = -400;
  let high = 400;
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (studentTCdf(mid, df) < p) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Сравнение групп критерием Уэлча, а не Стьюдента: дисперсии в группах разные
 * — дни с фастфудом шумнее обычных, — и общая дисперсия завысила бы значимость.
 */
export function compareGroup(
  residuals: number[],
  observations: Observation[],
  key: string,
  rho: number,
): Omit<Effect, "qValue" | "reportable"> | null {
  const withKey: number[] = [];
  const without: number[] = [];
  for (let i = 0; i < observations.length; i += 1) {
    (observations[i].keys.has(key) ? withKey : without).push(residuals[i]);
  }
  if (withKey.length < MIN_N_WITH || without.length < MIN_N_WITHOUT) return null;

  const n1 = effectiveN(withKey.length, rho);
  const n2 = effectiveN(without.length, rho);
  const v1 = variance(withKey) / n1;
  const v2 = variance(without) / n2;
  const standardError = Math.sqrt(v1 + v2);
  if (!(standardError > 0)) return null;

  const delta = mean(withKey) - mean(without);
  // Уэлч — Саттертуэйт.
  const df = (v1 + v2) ** 2 / (v1 ** 2 / (n1 - 1) + v2 ** 2 / (n2 - 1));
  if (!Number.isFinite(df) || df <= 0) return null;
  const critical = studentTQuantile(0.975, df);

  return {
    key,
    nWith: withKey.length,
    nWithout: without.length,
    deltaKg: round2(delta),
    ciLowKg: round2(delta - critical * standardError),
    ciHighKg: round2(delta + critical * standardError),
    pValue: 2 * (1 - studentTCdf(Math.abs(delta / standardError), df)),
  };
}

/**
 * Benjamini-Hochberg, шаг вверх.
 *
 * Контролируем долю ложных открытий, а не вероятность хотя бы одной ошибки:
 * на пятнадцати гипотезах поправка Бонферрони не покажет ничего никогда, а нам
 * важнее не пропустить настоящее, чем не ошибиться ни разу. Без всякой поправки
 * при двадцати блюдах одна-две «находки» гарантированы на чистом шуме.
 */
export function benjaminiHochberg(pValues: number[]): number[] {
  const n = pValues.length;
  if (n === 0) return [];
  const order = pValues.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p);
  const q = new Array<number>(n);
  let running = 1;
  for (let rank = n; rank >= 1; rank -= 1) {
    const { p, index } = order[rank - 1];
    running = Math.min(running, (p * n) / rank);
    q[index] = running;
  }
  return q;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Полный разбор. Порядок шагов и есть содержание метода:
 * соседние пары → причинный тренд → поправка на калории → эффективное N →
 * Уэлч → Бенджамини-Хохберг → порог размера эффекта.
 */
export function analyseDishImpact(
  weights: WeightPoint[],
  intake: DayIntake[],
  candidateKeys: string[],
): ImpactReport {
  const observations = buildObservations(weights, intake);
  const daysLogged = intake.filter((day) => day.mealCount >= MIN_MEALS_PER_DAY).length;

  if (observations.length < MIN_PAIRS_DESCRIPTIVE || daysLogged < MIN_DAYS_LOGGED) {
    return {
      level: "none",
      usablePairs: observations.length,
      daysLogged,
      kcalSlopeKgPer1000: null,
      effects: [],
      missingPairs: Math.max(0, MIN_PAIRS_DESCRIPTIVE - observations.length),
    };
  }

  const { residuals, slope } = removeCalorieEffect(observations);
  const rho = lag1Autocorrelation(residuals);
  const statistical = observations.length >= MIN_PAIRS_STATISTICAL;

  const raw = candidateKeys
    .map((key) => compareGroup(residuals, observations, key, rho))
    .filter((effect): effect is NonNullable<typeof effect> => effect !== null);

  const qValues = benjaminiHochberg(raw.map((effect) => effect.pValue));
  const effects: Effect[] = raw.map((effect, index) => ({
    ...effect,
    qValue: qValues[index],
    // На описательном уровне не «подтверждено» ничего: наблюдений мало, и
    // показывать там вывод — значит выдавать шум за находку.
    reportable:
      statistical && qValues[index] <= Q_MAX && Math.abs(effect.deltaKg) >= MIN_EFFECT_KG,
  }));

  return {
    level: statistical ? "statistical" : "descriptive",
    usablePairs: observations.length,
    daysLogged,
    kcalSlopeKgPer1000: round2(slope * 1000),
    // По модулю эффекта, а не по знаку: список, отсортированный от «худшего» к
    // «лучшему», — это рейтинг блюд, а его здесь не будет (docs/product-spec.md,
    // раздел 4.3: «Плохая еда» и «Запрещённый продукт» — запрещённые
    // формулировки, и порядок в списке говорит их не хуже слов).
    effects: effects.sort((a, b) => Math.abs(b.deltaKg) - Math.abs(a.deltaKg)),
    missingPairs: statistical ? 0 : MIN_PAIRS_STATISTICAL - observations.length,
  };
}
