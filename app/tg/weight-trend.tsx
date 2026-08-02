"use client";

import { useState } from "react";
import { pointsToArea, pointsToPolyline, sparklinePoints } from "@/lib/sparkline";
import type { TgWeight } from "./api";
import { addMeasurement } from "./plan-profile-api";
import { haptic } from "./telegram";

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
 * ## Почему запись веса живёт прямо здесь
 *
 * Раньше поле было только в «Профиле» — на четвёртой вкладке, за двумя
 * касаниями от карточки, которая как раз и напоминает про вес. Человек
 * видел свой тренд и не мог его пополнить, не уходя с экрана. Тренду же
 * нужны регулярные замеры: без них он просто перестаёт двигаться.
 *
 * Форма закрыта до нажатия. Открытое поле ввода в карточке, которую человек
 * видит каждый день, — это ежедневный молчаливый упрёк; кнопка честнее.
 *
 * Ничего не рендерит, если записей веса ещё нет: план без данных не может
 * посчитать ни цели, ни тренд, а пустой график хуже отсутствующего.
 */
export function WeightTrend({ weight, onAdded }: { weight: TgWeight | null; onAdded?: () => void }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const parsed = Number(value.trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 30 || parsed > 300) {
      setError("Вес должен быть от 30 до 300 кг.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addMeasurement(parsed);
      haptic("success");
      setValue("");
      setAdding(false);
      onAdded?.();
    } catch {
      haptic("error");
      setError("Не получилось сохранить замер.");
    } finally {
      setBusy(false);
    }
  }

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

    {adding
      ? <div className="tg-weight-add">
          <input
            className="tg-input" type="number" inputMode="decimal" step="0.1" min={30} max={300}
            placeholder="вес сегодня, кг" autoFocus
            value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) void handleAdd(); }}
          />
          <button className="tg-button" onClick={() => void handleAdd()} disabled={busy || value.trim() === ""}>
            {busy ? "…" : "Сохранить"}
          </button>
          <button className="tg-link" onClick={() => { setAdding(false); setError(null); }}>Отмена</button>
        </div>
      : <button className="tg-link tg-weight-add-open" onClick={() => { haptic("tap"); setAdding(true); }}>
          + Добавить замер
        </button>}
    {error && <p className="tg-error">{error}</p>}
  </section>;
}
