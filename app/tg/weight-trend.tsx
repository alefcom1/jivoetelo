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
 * Карточка показывается и без единого замера. Прятать её, пока замеров нет,
 * заманчиво — пустой график и правда хуже отсутствующего, — но тогда первый
 * вес записать неоткуда: единственная кнопка живёт внутри той самой
 * карточки, которой ещё нет. Поэтому график ждёт второй точки, а карточка
 * не ждёт ничего.
 */
export function WeightTrend({ weight, onAdded }: { weight: TgWeight | null; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entries = weight?.entries ?? [];
  const last = entries.length > 0 ? entries[entries.length - 1] : null;
  const points = sparklinePoints(entries.map((e) => e.trendKg), WIDTH, HEIGHT, PADDING);

  async function handleSave() {
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
      setOpen(false);
      // Перерисовать карточку нечем: тренд считает сервер (lib/trend.ts), и
      // после нового замера пересчитывается весь ряд, а не только последняя
      // точка. Поэтому не дописываем точку локально, а просим оболочку
      // перезагрузить «Сегодня».
      onAdded();
    } catch {
      haptic("error");
      setError("Не получилось сохранить замер.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="tg-card tg-weight">
    <div className="tg-weight-head">
      <div>
        <p className="tg-hint">Тренд веса</p>
        {last
          ? <strong>{last.trendKg} <small>кг</small></strong>
          : <strong className="tg-weight-empty">пока нет замеров</strong>}
      </div>
      <div className="tg-weight-actions">
        {weight?.weeklyChangeKg != null && <span className="tg-weight-change">
          {weight.weeklyChangeKg > 0 ? "+" : ""}{weight.weeklyChangeKg} кг за неделю
        </span>}
        <button
          className="tg-weight-add"
          aria-expanded={open}
          onClick={() => { haptic("tap"); setError(null); setOpen((current) => !current); }}
        >{open ? "Отмена" : "Добавить"}</button>
      </div>
    </div>

    {open && <div className="tg-weight-form">
      <input
        className="tg-input"
        type="number" inputMode="decimal" step="0.1" min={30} max={300}
        placeholder="вес сегодня, кг"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && value.trim() !== "") void handleSave(); }}
      />
      <button className="tg-button" onClick={() => void handleSave()} disabled={busy || value.trim() === ""}>
        {busy ? "…" : "Сохранить"}
      </button>
    </div>}
    {error && <p className="tg-error">{error}</p>}

    {entries.length > 1 && <svg
      className="tg-weight-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Тренд веса: ${last?.trendKg} кг`}
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

    {/* Одного замера на график не хватает, но и молчать о нём нельзя: человек
        только что его внёс и ждёт подтверждения, что число дошло. */}
    {entries.length === 1 && <p className="tg-hint">Первый замер записан. Линия тренда появится со вторым.</p>}
    {entries.length === 0 && <p className="tg-hint">Взвешивайтесь в одно и то же время — тренд сглаживает дневные колебания воды и еды.</p>}
  </section>;
}
