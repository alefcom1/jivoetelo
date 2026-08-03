// Что осталось закрыть сегодня — по всем пяти величинам сразу.
//
// Раньше подбор «что съесть сейчас» знал только про калории, белок и
// клетчатку, и знал в единственной форме: три числа уходили строкой в запрос
// к модели, а обратно приходили блюда с числами, которые придумала она.
// Проверки, что предложенное вообще влезает в остаток дня, не было нигде
// (`app/api/tg/suggest/route.ts`). План M3 обещал «детерминированные
// ограничения + генеративное объяснение»; сделана была вторая половина.
//
// Здесь первая. Модуль чистый: ни базы, ни модели, ни времени — только
// арифметика, которую можно покрыть тестами и на которую можно опереться.
//
// ── Главное решение ────────────────────────────────────────────────────────
//
// «Учитывать все недостающие параметры» не значит «гнаться за всеми пятью
// одинаково». Величины разной природы, и обращаться с ними одинаково —
// значит превратить спокойный дневник в трекер макросов, от которого мы
// отстраиваемся:
//
// - **Белок и клетчатка — это полы.** Их недобирают, и недобор стоит
//   закрыть. Перебор безвреден и в счёт не идёт.
// - **Энергия — коридор.** У цели есть `kcalMin` и `kcalMax`, и значение
//   имеет как недобор, так и перебор.
// - **Жиры и углеводы — остаток.** Они и считаются остатком: `macro-split`
//   выводит их из калорий и белка, а не задаёт отдельно. Требовать «добрать
//   углеводов» — числовой перфекционизм, который спецификация прямо
//   отвергает. Поэтому они учитываются **только как ограничение сверху**: мы
//   не предлагаем добрать жир, но и не советуем блюдо, которое выносит за
//   остаток жира вдвое.
//
// Отсюда правило, которое стоит держать в голове при правках: недобор жира и
// углеводов — не дефицит и в подсказках не упоминается никогда.

import type { NutritionTotals } from "./nutrition.ts";
import { splitMacroTargets } from "./macro-split.ts";
import type { Targets } from "./targets.ts";

/** Питательная ценность порции — то, что можно сравнить с остатком дня. */
export type Portion = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
};

export type DayGap = {
  /** Сколько энергии ещё уместно съесть: коридор, а не одно число. */
  kcalLeft: number;
  kcalLeftMin: number;
  kcalLeftMax: number;
  /** Недобор — то, что стоит закрыть. Ноль, если уже добрано. */
  proteinGap: number;
  fiberGap: number;
  /** Потолки: не «сколько добрать», а «сколько ещё влезает». */
  fatLeft: number;
  carbsLeft: number;
};

function gap(target: number, eaten: number): number {
  return Math.max(0, Math.round((target - eaten) * 10) / 10);
}

/**
 * Остаток дня по всем пяти величинам.
 *
 * `kcalLeft` может стать нулём, а `kcalLeftMax` — нет: даже перебрав дневную
 * цель, человек не обязан голодать до полуночи, и подсказка «есть нечего»
 * была бы и бесполезной, и вредной. Верхняя граница коридора остаётся тем
 * ориентиром, относительно которого считается перебор.
 */
export function dayGap(targets: Targets, totals: NutritionTotals): DayGap {
  const split = splitMacroTargets(targets.kcalTarget, targets.proteinTarget);

  return {
    kcalLeft: gap(targets.kcalTarget, totals.kcal),
    kcalLeftMin: gap(targets.kcalMin, totals.kcal),
    kcalLeftMax: gap(targets.kcalMax, totals.kcal),
    proteinGap: gap(targets.proteinTarget, totals.protein),
    fiberGap: gap(targets.fiberTarget, totals.fiber),
    fatLeft: gap(split.fatTarget, totals.fat),
    carbsLeft: gap(split.carbsTarget, totals.carbs),
  };
}

/**
 * Что именно не закрыто — в порядке того, о чём стоит говорить.
 *
 * Только полы: белок и клетчатка. Жир и углеводы сюда не попадают никогда,
 * даже если недобраны, — см. решение в шапке модуля.
 *
 * Порог в граммах, а не в процентах: «не хватает 2 г белка» — это шум,
 * который человек не закроет осмысленным действием, а вот 15 г — это уже
 * порция творога.
 */
const PROTEIN_NOISE_G = 8;
const FIBER_NOISE_G = 4;

export function openGaps(gapState: DayGap): Array<"protein" | "fiber"> {
  const open: Array<"protein" | "fiber"> = [];
  if (gapState.proteinGap >= PROTEIN_NOISE_G) open.push("protein");
  if (gapState.fiberGap >= FIBER_NOISE_G) open.push("fiber");
  return open;
}

export type CandidateScore = {
  /** Итог: чем больше, тем лучше вариант закрывает день. */
  score: number;
  /** Сколько граммов дефицита действительно закроется — для честного текста. */
  closesProtein: number;
  closesFiber: number;
  /** Насколько выводит за верхнюю границу коридора энергии, ккал. */
  overshootKcal: number;
};

/**
 * Насколько порция подходит под остаток дня.
 *
 * Считается в долях, а не в килокалориях, чтобы вес слагаемых не зависел от
 * размера человека: у одного остаток 300 ккал, у другого 1500, и абсолютные
 * числа сделали бы вторых всегда «важнее».
 *
 * Закрытие дефицита считается **с отсечением**: порция на 60 г белка при
 * недоборе в 20 г закрывает двадцать, а не шестьдесят. Иначе подбор
 * скатывается к «чем больше белка, тем лучше» — это ровно тот перекос, из-за
 * которого приложения о питании превращаются в спортивные.
 */
export function scoreCandidate(gapState: DayGap, portion: Portion): CandidateScore {
  const closesProtein = Math.min(Math.max(0, portion.protein), gapState.proteinGap);
  const closesFiber = Math.min(Math.max(0, portion.fiber), gapState.fiberGap);

  // Доля закрытого дефицита. Если дефицита нет, слагаемое не участвует:
  // делить на ноль нечем, а «закрыть несуществующее» — не заслуга.
  const proteinFit = gapState.proteinGap > 0 ? closesProtein / gapState.proteinGap : 0;
  const fiberFit = gapState.fiberGap > 0 ? closesFiber / gapState.fiberGap : 0;

  // Белок весит больше клетчатки: недобор белка человек чувствует голодом и
  // потерей мышц, недобор клетчатки — нет.
  const fit = proteinFit * 0.65 + fiberFit * 0.35;

  // Перебор считается от верхней границы коридора, а не от точки: выйти за
  // kcalTarget — обычное дело, выйти за kcalMax — уже другой разговор.
  const overshootKcal = Math.max(0, Math.round(portion.kcal - gapState.kcalLeftMax));

  // Энергия — цена варианта. Штраф растёт с долей съеденного остатка, но
  // мягко: еда обязана занимать место в дне, иначе подбор выродится в
  // «съешьте огурец».
  const budget = Math.max(1, gapState.kcalLeftMax);
  const cost = Math.min(1.5, portion.kcal / budget) * 0.3;

  // Перебор — отдельный и жёсткий штраф, пропорциональный тому, насколько
  // вышли за коридор.
  const overshootPenalty = overshootKcal > 0 ? Math.min(1, overshootKcal / budget) * 0.8 : 0;

  // Жиры и углеводы: только сверху и только за грубый выход. Полтора остатка
  // — это уже не «чуть больше», это другое блюдо.
  const fatOver = gapState.fatLeft > 0 ? Math.max(0, portion.fat / gapState.fatLeft - 1.5) : 0;
  const carbsOver = gapState.carbsLeft > 0 ? Math.max(0, portion.carbs / gapState.carbsLeft - 1.5) : 0;
  const macroPenalty = Math.min(0.4, (fatOver + carbsOver) * 0.2);

  return {
    score: Math.round((fit - cost - overshootPenalty - macroPenalty) * 1000) / 1000,
    closesProtein: Math.round(closesProtein * 10) / 10,
    closesFiber: Math.round(closesFiber * 10) / 10,
    overshootKcal,
  };
}

/**
 * Строка «почему это сейчас» без участия модели.
 *
 * Нужна не как запасной вариант на случай сбоя, а как основной режим при
 * выключенном разборе: подбор к тому времени уже детерминированный, и
 * объяснение из тех же чисел — честнее, чем сгенерированное.
 *
 * Говорим только о том, что действительно закрывается, и только про полы.
 */
export function explain(score: CandidateScore, showCalories: boolean, portionKcal: number): string {
  const parts: string[] = [];
  if (score.closesProtein >= 1) parts.push(`закроет ${Math.round(score.closesProtein)} г белка`);
  if (score.closesFiber >= 1) parts.push(`${Math.round(score.closesFiber)} г клетчатки`);

  if (parts.length === 0) {
    return showCalories
      ? `Укладывается в остаток дня — примерно ${Math.round(portionKcal)} ккал.`
      : "Укладывается в остаток дня.";
  }

  const head = parts.join(" и ");
  return showCalories
    ? `${head[0].toUpperCase()}${head.slice(1)} и уложится в остаток — примерно ${Math.round(portionKcal)} ккал.`
    : `${head[0].toUpperCase()}${head.slice(1)}.`;
}
