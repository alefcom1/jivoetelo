// Адаптивная корректировка цели (раздел 14.2 спецификации): небольшие шаги,
// только при достатке данных и только с явного подтверждения пользователя.

import type { Goal } from "./targets.ts";

export type AdjustmentInput = {
  goal: Goal;
  /** Изменение тренда веса за последнюю неделю, кг (weeklyTrendChange). */
  weeklyTrendChangeKg: number | null;
  latestWeightKg: number;
  /** Сколько дней за последнюю неделю есть записи еды. */
  daysLogged: number;
  /** Уже накопленная корректировка из профиля. */
  currentAdjustment: number;
};

export type AdjustmentProposal = {
  deltaKcal: number;
  reason: string;
};

const STEP = 150;
const MAX_TOTAL = 450;
const MIN_DAYS_LOGGED = 5;

function withinCap(current: number, delta: number): boolean {
  return Math.abs(current + delta) <= MAX_TOTAL;
}

/**
 * Предлагает корректировку ±150 ккал или null, если данных мало либо
 * динамика в пределах ожидаемой. Формулировки — поддерживающие (раздел 4.3).
 */
export function proposeAdjustment(input: AdjustmentInput): AdjustmentProposal | null {
  if (input.weeklyTrendChangeKg === null || input.daysLogged < MIN_DAYS_LOGGED) return null;

  const changePct = (input.weeklyTrendChangeKg / input.latestWeightKg) * 100;

  let delta = 0;
  let reason = "";

  if (input.goal === "lose") {
    if (changePct < -1) {
      delta = STEP;
      reason =
        "Тренд веса снижается быстрее запланированного. Предлагаем добавить 150 ккал к дневному диапазону — так темп станет устойчивее.";
    } else if (changePct > -0.1) {
      delta = -STEP;
      reason =
        "Тренд веса за неделю почти не изменился. Можно уменьшить дневной диапазон на 150 ккал — без резких шагов.";
    }
  } else if (input.goal === "maintain") {
    if (changePct > 0.4) {
      delta = -STEP;
      reason = "Тренд веса понемногу растёт. Предлагаем уменьшить дневной диапазон на 150 ккал, чтобы вернуться к поддержанию.";
    } else if (changePct < -0.4) {
      delta = STEP;
      reason = "Тренд веса понемногу снижается. Предлагаем добавить 150 ккал, чтобы удерживать вес стабильным.";
    }
  } else if (input.goal === "gain") {
    if (changePct < 0.1) {
      delta = STEP;
      reason = "Тренд веса пока не растёт. Предлагаем добавить 150 ккал к дневному диапазону.";
    } else if (changePct > 0.75) {
      delta = -STEP;
      reason = "Тренд веса растёт быстрее запланированного. Предлагаем уменьшить дневной диапазон на 150 ккал.";
    }
  }

  if (delta === 0 || !withinCap(input.currentAdjustment, delta)) return null;
  return { deltaKcal: delta, reason };
}
