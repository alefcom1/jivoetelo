"use client";

// Экран «План»: динамика веса, приверженность дневнику и разбор адаптивной
// цели. Один прокручиваемый экран, а не три подвкладки — при нашем объёме
// данных (три коротких секции) внутренние вкладки добавили бы навигацию, но
// не читаемость: и вебовский «Недельный обзор» (app/app/review) устроен так
// же, одной прокруткой из нескольких секций.

import { useEffect, useState } from "react";
import { pointsToArea } from "@/lib/sparkline";
import { buildWeightChart } from "@/lib/weight-chart";
import { ArtTrend } from "./illustrations";
import { fetchPlan, type PlanResponse } from "./plan-profile-api";

const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const CHART_PADDING = 10;

function formatSignedKg(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toString().replace(".", ",")} кг`;
}

/** График тренда: линия сглаженного веса плюс пунктир целевого веса, если он задан. */
function WeightChart({ trend, targetWeightKg }: { trend: PlanResponse["trend"]; targetWeightKg: number | null }) {
  const chart = buildWeightChart(trend, {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    padding: CHART_PADDING,
    targetWeightKg,
  });
  if (!chart) return null;

  return <svg
    className="tg-chart"
    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
    preserveAspectRatio="none"
    role="img"
    aria-label="График тренда веса"
  >
    <defs>
      {/* Идентификатор тот же, что у мини-графика на «Сегодня»: экраны не
          показываются одновременно, а определение градиента — часть того
          SVG, в котором оно объявлено. */}
      <linearGradient id="tg-area-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--brand-coral)" stopOpacity="0.22" />
        <stop offset="100%" stopColor="var(--brand-coral)" stopOpacity="0" />
      </linearGradient>
    </defs>
    {chart.points.length > 1 && <path className="tg-chart-area" d={pointsToArea(chart.points, CHART_HEIGHT)} />}
    {chart.targetY !== null && <line
      className="tg-chart-target"
      x1={CHART_PADDING} x2={CHART_WIDTH - CHART_PADDING}
      y1={chart.targetY} y2={chart.targetY}
    />}
    {chart.points.length > 1 && <polyline className="tg-chart-line" points={chart.linePoints} />}
    {chart.lastPoint && <circle className="tg-chart-dot" cx={chart.lastPoint.x} cy={chart.lastPoint.y} r={3.5} />}
  </svg>;
}

/** Столбики приверженности: сколько раз за окно наблюдения выпадал каждый
 * день недели и сколько раз в этот день велась запись. Без цвета «плохо/хорошо». */
function AdherenceBars({ adherence }: { adherence: PlanResponse["adherence"] }) {
  // Оба столбика — «сколько раз этот день недели вообще выпал в окне» (блёклый,
  // фон) и «сколько раз в этот день была запись» (тёмный, поверх) — меряем от
  // одного и того же максимума, чтобы столбики были сравнимы друг с другом, а
  // не только сами с собой. И трек, и заливка — абсолютно спозиционированные
  // элементы одной и той же высоты .tg-weekbar-slot, иначе высота заливки в
  // процентах считалась бы от высоты трека, а не от общей шкалы.
  const maxTotal = Math.max(...adherence.days.map((d) => d.totalCount), 1);
  return <div className="tg-weekbars">
    {adherence.days.map((day) => <div className="tg-weekbar" key={day.weekday}>
      <div className="tg-weekbar-count">{day.loggedCount}</div>
      <div className="tg-weekbar-slot">
        <div className="tg-weekbar-track" style={{ height: `${(day.totalCount / maxTotal) * 100}%` }} />
        <div className="tg-weekbar-fill" style={{ height: `${(day.loggedCount / maxTotal) * 100}%` }} />
      </div>
      <span className="tg-weekbar-label">{day.label}</span>
    </div>)}
  </div>;
}

export function PlanTab() {
  const [data, setData] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlan()
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setError("Не получилось загрузить план."); });
    return () => { cancelled = true; };
  }, []);

  if (!data) {
    return <div className="tg-page">
      <header className="tg-hero"><h1>План</h1></header>
      {error ? <p className="tg-error">{error}</p> : <div className="tg-spinner" aria-label="Загрузка" />}
    </div>;
  }

  const { targets, trend, weeklyTrendChangeKg, latestWeightKg, targetWeightKg, hasEnoughTrendData, adherence, hasEnoughAdherenceData } = data;

  return <div className="tg-page">
    <header className="tg-hero"><h1>План</h1></header>

    {/* Адаптивная цель */}
    {targets
      ? <section className="tg-card tg-plan-target">
          <p className="tg-kicker">Цель по энергии</p>
          <p className="tg-plan-target-value tg-bar--energy"><strong>{targets.kcalTarget}</strong><span> ккал в день</span></p>
          <p className="tg-hint">Вероятно между {targets.kcalMin} и {targets.kcalMax} ккал · белок {targets.proteinTarget} г · клетчатка {targets.fiberTarget} г</p>
          {targets.adjusted && <p className="tg-hint">Число поднято до безопасного минимума.</p>}

          <details className="tg-explain">
            <summary>Почему столько?</summary>
            <div className="tg-explain-body">
              <p>Расчётный расход энергии (формула Миффлина-Сан Жеора с поправкой на активность): <b>{targets.tdeeKcal} ккал</b>.</p>
              {!targets.adjusted && <p>
                Цель по формуле для цели «{targets.goal === "lose" ? "снижение веса" : targets.goal === "gain" ? "набор массы" : "поддержание веса"}»: <b>{targets.kcalTarget - targets.kcalAdjustment} ккал</b>.
              </p>}
              <p>
                {targets.kcalAdjustment === 0
                  ? "Адаптивных поправок пока не было — стартовый расчёт не менялся."
                  : `Поправка по фактической динамике: ${targets.kcalAdjustment > 0 ? "+" : ""}${targets.kcalAdjustment} ккал.`}
              </p>
              <p>Итог: <b>{targets.kcalTarget} ккал</b>.</p>
              {targets.adjusted && <p className="tg-hint">
                Число скорректировано с учётом безопасных ограничений (минимальный возраст для цели «снижение веса» или нижний порог калорийности) — поэтому точная сумма формулы и поправки выше не сходится один в один.
              </p>}
              <p className="tg-hint">Полный недельный обзор с предложением по корректировке — в <a className="tg-link" href="/app/review" target="_blank" rel="noreferrer">веб-версии</a>.</p>
            </div>
          </details>
        </section>
      : <section className="tg-card tg-hint-card">
          <p>Настройте стартовый план в веб-версии — здесь появится цель по энергии и её объяснение.</p>
          <a className="tg-link" href="/app/onboarding" target="_blank" rel="noreferrer">Настроить план →</a>
        </section>}

    {/* Динамика веса */}
    <section className="tg-section">
      <h2>Динамика веса</h2>
      {hasEnoughTrendData
        ? <div className="tg-card tg-plan-weight">
            <WeightChart trend={trend} targetWeightKg={targetWeightKg} />
            <div className="tg-plan-weight-stats">
              <div><strong>{trend[trend.length - 1].trendKg}</strong><span>тренд, кг</span></div>
              <div>
                <strong>{weeklyTrendChangeKg === null ? "—" : formatSignedKg(weeklyTrendChangeKg)}</strong>
                <span>за 7 дней</span>
              </div>
              <div><strong>{targetWeightKg ?? "—"}</strong><span>цель, кг</span></div>
            </div>
          </div>
        : <div className="tg-card tg-empty-card">
            <ArtTrend />
            <p>
              {latestWeightKg === null
                ? "Замеров веса пока нет. Первый появится в веб-профиле или в течение недели покажет тренд здесь."
                : `Последний замер: ${latestWeightKg} кг. Наблюдений меньше недели — рано показывать тренд, но он появится, как только наберётся неделя записей.`}
            </p>
          </div>}
    </section>

    {/* Приверженность */}
    <section className="tg-section">
      <h2>Приверженность</h2>
      {hasEnoughAdherenceData
        ? <div className="tg-card">
            <p className="tg-hint">
              Дней с записями за последние {adherence.totalDays}: {adherence.totalLoggedDays} из {adherence.totalDays}.
              Это факт, не оценка — распределение по дням недели может подсказать, где удобнее записывать.
            </p>
            <AdherenceBars adherence={adherence} />
          </div>
        : <div className="tg-card tg-hint-card">
            <p>Меньше недели наблюдений — рано показывать распределение по дням недели.</p>
          </div>}
    </section>
  </div>;
}
