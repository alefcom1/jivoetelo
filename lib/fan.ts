/**
 * Коридор снижения веса — то, что мы рисуем вместо одной линии к одной дате.
 *
 * ## Почему веер, а не линия
 *
 * Конкуренты рисуют плавную кривую из точки «сегодня» в точку «88 кг,
 * 6 ноября». Такая линия — не упрощение, а ложь в графической форме: она
 * изображает точность, которой в исходных данных нет. Формула Миффлина —
 * Сан Жеора оценивает суточный расход конкретного человека с ошибкой
 * порядка ±15%, и это не наша скромность, а свойство любой формулы,
 * построенной на росте, весе, возрасте и поле.
 *
 * Веер — не более слабая версия линии, а более честный жанр. Так рисуют
 * прогнозы там, где к точности относятся всерьёз: конус траектории урагана,
 * веерная диаграмма инфляции. Читается он не как «мы не знаем», а как
 * «мы понимаем, откуда берётся разброс».
 *
 * ## Почему кривая загибается
 *
 * Мы не считаем «дефицит × недели ÷ 7700». По мере снижения веса падает и
 * расход: та же тарелка перестаёт быть дефицитом. Поэтому здесь понедельная
 * симуляция, где расход пересчитывается от текущего веса, а потребление
 * остаётся тем, что человек выбрал. Кривая выполаживается сама, и это не
 * украшение: у конкурента она загибается для красоты, у нас — потому что так
 * ведёт себя арифметика.
 *
 * Из этого следует вывод, которого нет ни у кого из них: при фиксированном
 * потреблении снижение однажды останавливается. Если цель лежит за этой
 * точкой, честный ответ — «этим планом до неё не дойти», а не дата.
 */

import { computeTdee, type Activity, type SexForFormula } from "./targets.ts";

/** Килокалорий в килограмме жировой ткани. То же число, что в lib/pace.ts. */
const KCAL_PER_KG = 7700;

/**
 * Насколько формула может ошибаться в оценке расхода для конкретного
 * человека. 15% — обычная величина индивидуального разброса вокруг
 * предсказания Миффлина; именно она и задаёт ширину веера.
 */
export const TDEE_ERROR = 0.15;

/** Дальше этого срока не считаем: план всё равно будет уточнён по дневнику. */
export const MAX_WEEKS = 78;

export type FanInput = {
  sexForFormula: SexForFormula;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  /** Сколько человек ест в день по плану. */
  intakeKcal: number;
  /** Куда хочет прийти. Без цели считаем только траекторию. */
  targetWeightKg?: number;
  weeks?: number;
  currentYear?: number;
};

export type FanLine = {
  /** Вес по неделям, включая нулевую. */
  points: number[];
  /** Неделя, на которой достигнута цель, или null, если не достигнута. */
  weeksToTarget: number | null;
};

export type Fan = {
  /** Медленный край: формула завысила расход, дефицит на деле меньше. */
  slow: FanLine;
  /** Середина: формула угадала. */
  mid: FanLine;
  /** Быстрый край: формула занизила расход. */
  fast: FanLine;
  /** Диапазон недель до цели. `null` в поле — этим краем цель не достигается. */
  weeksToTarget: { fast: number | null; slow: number | null } | null;
  /**
   * Вес, ниже которого при этом потреблении снижение практически
   * останавливается: расход сравнялся с едой. Считается по средней линии.
   */
  plateauKg: number;
  /**
   * То же для медленного края. Отдельно, потому что именно его надо называть,
   * объясняя «если формула завысила ваш расход»: подставлять туда среднее
   * плато — значит приписывать одному сценарию число из другого.
   */
  plateauSlowKg: number;
  /**
   * Растёт ли вес по медленному краю. Такое бывает, и это важно сказать: если
   * формула завысила расход, план с «дефицитом» на деле оказывается
   * профицитом, и вес медленно идёт вверх. Ни одна воронка конкурентов такого
   * не показывает — их линия всегда идёт вниз.
   */
  slowRises: boolean;
};

/**
 * Одна траектория при заданной поправке к расходу.
 *
 * `bias` — множитель к расходу: 0.85 означает «формула завысила на 15%,
 * на самом деле человек тратит меньше», то есть худеет медленнее.
 */
function simulate(input: FanInput, bias: number, weeks: number): FanLine {
  const currentYear = input.currentYear ?? new Date().getFullYear();
  let weight = input.weightKg;
  const points = [weight];
  let weeksToTarget: number | null = null;

  for (let week = 1; week <= weeks; week += 1) {
    const tdee =
      computeTdee(
        {
          sexForFormula: input.sexForFormula,
          birthYear: input.birthYear,
          heightCm: input.heightCm,
          weightKg: weight,
          activity: input.activity,
        },
        currentYear,
      ) * bias;

    const weeklyDeficit = (tdee - input.intakeKcal) * 7;
    weight = Math.max(0, weight - weeklyDeficit / KCAL_PER_KG);
    points.push(weight);

    if (
      weeksToTarget === null &&
      input.targetWeightKg !== undefined &&
      weight <= input.targetWeightKg
    ) {
      weeksToTarget = week;
    }
  }

  return { points, weeksToTarget };
}

/**
 * Вес, при котором расход сравнивается с потреблением. Ниже него при этом
 * плане вес практически не идёт — не «медленнее», а именно перестаёт.
 *
 * Ищем делением отрезка, а не формулой: расход линеен по весу, но границы
 * и коэффициенты живут в computeTdee, и повторять их здесь значило бы
 * завести вторую версию формулы.
 */
function plateauWeight(input: FanInput, bias: number): number {
  const currentYear = input.currentYear ?? new Date().getFullYear();
  const at = (weightKg: number) =>
    computeTdee(
      { sexForFormula: input.sexForFormula, birthYear: input.birthYear, heightCm: input.heightCm, weightKg, activity: input.activity },
      currentYear,
    ) * bias;

  let low = 20;
  let high = Math.max(input.weightKg, 30);
  if (at(high) <= input.intakeKcal) return high;
  if (at(low) >= input.intakeKcal) return low;

  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (at(mid) > input.intakeKcal) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

/**
 * Считает веер. Никаких дат: даты — дело интерфейса, здесь только недели,
 * иначе модуль пришлось бы завязывать на текущее время и он перестал бы
 * быть проверяемым без подмены часов.
 */
export function buildFan(input: FanInput): Fan {
  const weeks = Math.min(MAX_WEEKS, Math.max(1, input.weeks ?? MAX_WEEKS));

  // Меньший расход — медленнее снижение, поэтому «медленный» край получает
  // множитель ниже единицы. Путаница в эту сторону выглядела бы как
  // перевёрнутый веер, и это первое, что проверяет тест.
  const slow = simulate(input, 1 - TDEE_ERROR, weeks);
  const mid = simulate(input, 1, weeks);
  const fast = simulate(input, 1 + TDEE_ERROR, weeks);

  return {
    slow,
    mid,
    fast,
    weeksToTarget:
      input.targetWeightKg === undefined
        ? null
        : { fast: fast.weeksToTarget, slow: slow.weeksToTarget },
    plateauKg: plateauWeight(input, 1),
    plateauSlowKg: plateauWeight(input, 1 - TDEE_ERROR),
    slowRises: slow.points[slow.points.length - 1] > slow.points[0] + 0.1,
  };
}

/**
 * Достижима ли цель этим планом хотя бы по среднему сценарию.
 *
 * Отдельная функция, потому что ответ «нет» — не ошибка ввода и не повод
 * прятать результат: это самая полезная вещь, которую расчёт может сказать.
 * «При таком питании вес остановится около 78 кг» честнее и практичнее, чем
 * дата, которая не наступит.
 */
export function reachesTarget(fan: Fan): boolean {
  return fan.mid.weeksToTarget !== null;
}
