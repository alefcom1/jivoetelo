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

/**
 * Поправка со знаком: «+150», «−150».
 *
 * Настоящий минус «−», а не дефис — по той же причине, что и в килограммах
 * (formatKg в lib/trend.ts): дефис в шрифте короче и выше, и рядом с плюсом из
 * соседнего состояния кнопки читается как другой знак. Одна функция на оба
 * клиента: кнопку «Применить» показывают и кабинет, и Mini App.
 */
export function formatKcalChange(value: number): string {
  // Ноль без знака: «−0» читается как опечатка. Предложение нулевым не бывает
  // (proposeAdjustment вернёт null), но применённая величина приходит из базы.
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value)}`;
}
