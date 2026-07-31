"use client";

/**
 * Веер вместо линии — единственный график во всей воронке. Инлайновый SVG,
 * без библиотек: та же техническая рамка, что у app/tg/weight-trend.tsx.
 *
 * Правый край подписан не датой, а диапазоном месяцев — и если формула
 * завысила расход человека, нижняя (медленная) оценка вообще не доходит до
 * цели (fan.weeksToTarget.slow === null). Это не ошибка расчёта, а самый
 * полезный его вывод (см. lib/fan.ts и tests/fan.test.mjs), и здесь он
 * обязан быть сказан словами, а не спрятан.
 */

import type { Fan } from "@/lib/fan";
import { pluralRu, withPluralRu } from "@/lib/plural";

const WIDTH = 680;
const HEIGHT = 300;
const PAD_X = 10;
const PAD_TOP = 16;
const PAD_BOTTOM = 26;

const MONTH_FORMS = ["месяц", "месяца", "месяцев"] as const;
const WEEK_FORMS = ["неделя", "недели", "недель"] as const;

function weeksToMonths(weeks: number): number {
  return Math.max(1, Math.round(weeks / 4.345));
}

function monthsRangeLabel(fastWeeks: number, slowWeeks: number): string {
  const fastMonths = weeksToMonths(fastWeeks);
  const slowMonths = weeksToMonths(slowWeeks);
  if (fastMonths >= slowMonths) return `около ${withPluralRu(fastMonths, MONTH_FORMS)}`;
  return `${fastMonths}–${slowMonths} ${pluralRu(slowMonths, MONTH_FORMS)}`;
}

function formatKg(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace(".", ",");
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Сколько недель реально показывать. Все 78 расчётных смотреть особенно не
 * на что, если цель близко или её вовсе нет, — поэтому горизонт подбирается
 * под то, что на графике должно быть видно: край веера у цели или разумный
 * срок по умолчанию.
 */
function computeHorizon(fan: Fan): number {
  const total = fan.mid.points.length - 1;
  let horizon = 24;
  if (fan.weeksToTarget?.slow != null) horizon = fan.weeksToTarget.slow + 4;
  else if (fan.weeksToTarget?.fast != null) horizon = fan.weeksToTarget.fast + 10;
  return Math.min(total, Math.max(8, horizon));
}

export default function FanChart({ fan, targetWeightKg, maintaining = false }: {
  fan: Fan;
  targetWeightKg?: number;
  /** План на поддержание: снижения не планируется, сроки до цели неуместны. */
  maintaining?: boolean;
}) {
  const horizon = computeHorizon(fan);
  const slowPts = fan.slow.points.slice(0, horizon + 1);
  const fastPts = fan.fast.points.slice(0, horizon + 1);
  const midPts = fan.mid.points.slice(0, horizon + 1);
  const currentWeightKg = fan.mid.points[0];

  const values = [...slowPts, ...fastPts];
  if (targetWeightKg !== undefined) values.push(targetWeightKg);
  let minKg = Math.min(...values);
  let maxKg = Math.max(...values);
  if (maxKg - minKg < 1) {
    const mid = (maxKg + minKg) / 2;
    minKg = mid - 0.5;
    maxKg = mid + 0.5;
  }
  const pad = (maxKg - minKg) * 0.1;
  minKg -= pad;
  maxKg += pad;

  const innerWidth = WIDTH - PAD_X * 2;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  function x(week: number): number {
    return PAD_X + (week / horizon) * innerWidth;
  }
  function y(kg: number): number {
    return PAD_TOP + innerHeight * (1 - (kg - minKg) / (maxKg - minKg));
  }

  // Заливка идёт вперёд по медленному краю и обратно по быстрому — так
  // получается один замкнутый контур между двумя линиями, а не две
  // отдельные кривые.
  const slowPath = slowPts.map((kg, i) => `${i === 0 ? "M" : "L"}${round1(x(i))},${round1(y(kg))}`).join(" ");
  const fastReversed = [...fastPts].reverse();
  const fastPath = fastReversed.map((kg, i) => `L${round1(x(horizon - i))},${round1(y(kg))}`).join(" ");
  const areaPath = `${slowPath} ${fastPath} Z`;
  const midPath = midPts.map((kg, i) => `${i === 0 ? "M" : "L"}${round1(x(i))},${round1(y(kg))}`).join(" ");

  const targetY = targetWeightKg !== undefined ? y(targetWeightKg) : null;
  const todayX = round1(x(0));
  const todayY = round1(y(currentWeightKg));

  const hasTarget = fan.weeksToTarget !== null;
  const fastWeeks = fan.weeksToTarget?.fast ?? null;
  const slowWeeks = fan.weeksToTarget?.slow ?? null;

  let cornerLabel = "без цели по весу";
  let plateauNote: string | null = null;

  if (maintaining) {
    // План на поддержание: снижения не планируется, и подписи про сроки до
    // цели читались бы как обещание, которого мы не давали. Первый прогон
    // показал ровно это — «вес остановится около 102 кг», то есть на том же
    // месте, с которого начали.
    cornerLabel = "план на поддержание";
    plateauNote = targetWeightKg !== undefined
      ? "Это план на поддержание: вес по нему остаётся примерно там же, где сейчас. Цель по весу мы показываем на графике как ориентир, а не как срок."
      : null;
  } else if (hasTarget) {
    if (slowWeeks !== null && fastWeeks !== null) {
      cornerLabel = `до цели: ${monthsRangeLabel(fastWeeks, slowWeeks)}`;
    } else {
      // Самый полезный случай расчёта: нижняя (медленная) оценка до цели не
      // доходит вовсе — сказать об этом словами важнее, чем нарисовать
      // среднюю линию и сделать вид, что цель достижима.
      cornerLabel = fastWeeks !== null
        ? `по быстрому краю — около ${withPluralRu(weeksToMonths(fastWeeks), MONTH_FORMS)}`
        : "в этом плане цель не достигается";
      // Называем плато именно медленного края: подставлять сюда среднее —
      // значит приписывать одному сценарию число из другого. Отдельно
      // разбираем случай, когда медленный край не останавливается, а растёт:
      // если формула завысила расход, «дефицитный» план оказывается
      // профицитом. Редкий, но самый полезный вывод расчёта.
      plateauNote = fan.slowRises
        ? "Если формула завысила ваш расход, дефицита при таком питании не получится вовсе — вес может медленно идти вверх. " +
          "Две недели дневника покажут, так это или нет, и мы пересчитаем."
        : `Если формула завысила ваш расход, при таком питании вес остановится около ${Math.round(fan.plateauSlowKg)} кг, ` +
          "не дойдя до цели.";
    }
  }

  const ariaLabel = hasTarget
    ? `Коридор веса: сегодня ${formatKg(currentWeightKg)} кг, ${cornerLabel}${plateauNote ? `. ${plateauNote}` : ""}`
    : `Коридор веса: сегодня ${formatKg(currentWeightKg)} кг, прогноз на ${withPluralRu(horizon, WEEK_FORMS)} без заданной цели по весу`;

  return <div className="plan-chart">
    <div className="plan-chart-head">
      <span>сегодня — {formatKg(currentWeightKg)} кг</span>
      <span>{cornerLabel}</span>
    </div>

    <svg
      className="plan-chart-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
    >
      <path className="plan-chart-area" d={areaPath} />
      <path className="plan-chart-mid" d={midPath} />

      {targetY !== null &&
        <line className="plan-chart-target" x1={PAD_X} y1={round1(targetY)} x2={WIDTH - PAD_X} y2={round1(targetY)} />}
      {targetY !== null && targetWeightKg !== undefined &&
        <text className="plan-chart-target-label" x={WIDTH - PAD_X} y={round1(targetY) - 6} textAnchor="end">
          цель — {formatKg(targetWeightKg)} кг
        </text>}

      <circle className="plan-chart-today" cx={todayX} cy={todayY} r="6" />

      <text className="plan-chart-axis" x={PAD_X} y={HEIGHT - 8}>сегодня</text>
      <text className="plan-chart-axis" x={WIDTH - PAD_X} y={HEIGHT - 8} textAnchor="end">
        {withPluralRu(horizon, WEEK_FORMS)}
      </text>
    </svg>

    <p className="plan-chart-caption">
      Коридор, а не линия: формула оценивает расход с погрешностью около 15%. Дневник сузит его за две недели.
    </p>
    {plateauNote && <p className="plan-chart-note">{plateauNote}</p>}
  </div>;
}
