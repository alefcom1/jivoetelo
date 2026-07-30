"use client";

import { pointsToArea, pointsToPolyline, sparklinePoints } from "@/lib/sparkline";
import type { TgWeight } from "./api";

const WIDTH = 280;
const HEIGHT = 64;
const PADDING = 6;

/**
 * Тренд веса небольшим графиком — SVG рисуется вручную, без библиотек
 * (технические рамки спецификации Mini App v2). На графике сглаженный
 * тренд (`lib/trend.ts`), а не дневные замеры: дневные колебания — это
 * вода и еда, тренд показывает настоящую динамику (тот же принцип, что и
 * в вебе, `app/app/weight/page.tsx`).
 *
 * Ничего не рендерит, если записей веса ещё нет: план без данных не может
 * посчитать ни цели, ни тренд, а пустой график хуже отсутствующего.
 */
export function WeightTrend({ weight }: { weight: TgWeight | null }) {
  if (!weight || weight.entries.length === 0) return null;

  const { entries, weeklyChangeKg } = weight;
  const last = entries[entries.length - 1];
  const points = sparklinePoints(entries.map((e) => e.trendKg), WIDTH, HEIGHT, PADDING);

  return <section className="tg-card tg-weight">
    <div className="tg-weight-head">
      <div>
        <p className="tg-hint">Тренд веса</p>
        <strong>{last.trendKg} <small>кг</small></strong>
      </div>
      {weeklyChangeKg !== null && <span className="tg-weight-change">
        {weeklyChangeKg > 0 ? "+" : ""}{weeklyChangeKg} кг за неделю
      </span>}
    </div>
    {entries.length > 1 && <svg
      className="tg-weight-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Тренд веса: ${last.trendKg} кг`}
    >
      <defs>
        {/* Заливка под линией: одинокая линия на пустом поле выглядела
            черновиком. Градиент вниз до прозрачного — чтобы низ карточки не
            превращался в цветную плашку. */}
        <linearGradient id="tg-area-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-coral)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--brand-coral)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="tg-weight-area" d={pointsToArea(points, HEIGHT)} />
      <polyline points={pointsToPolyline(points)} />
    </svg>}
  </section>;
}
