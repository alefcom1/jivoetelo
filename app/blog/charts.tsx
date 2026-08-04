/**
 * Графики статей: SVG, нарисованный сервером.
 *
 * Без клиентского JS и без библиотек: каждый график — детерминированная
 * функция от данных, отдаётся как разметка и весит меньше, чем подключение
 * любого чартового пакета. Палитра — переменные бренда, но в SVG цвета
 * зашиты явно: график должен выглядеть одинаково и в статье, и в RSS-читалке,
 * которая CSS-переменных не знает.
 *
 * Числа для графика диапазонов берутся из lib/dishes — того же файла, из
 * которого собран справочник «Сколько калорий». График не может разойтись
 * со страницами блюд, потому что у них один источник.
 */

import { findDish } from "@/lib/dishes";

const INK = "#171917";
const CORAL = "#e56d55";
const LIME = "#d9e49c";
const LINE = "#d7d4ca";
const MUTED = "#75766f";
const PAPER = "#f4f1ea";

/**
 * Диапазоны калорийности блюд на 100 г — горизонтальные полосы.
 * Показывает главное: «одно число» соседних таблиц — это точка,
 * произвольно выбранная внутри широкой полосы.
 */
export function DishRangeChart() {
  const dishes = ["borshch", "plov", "olive", "syrniki"]
    .map((slug) => findDish(slug))
    .filter((dish): dish is NonNullable<typeof dish> => Boolean(dish));

  const max = 320;
  const left = 120;
  const right = 40;
  const width = 760;
  const rowH = 64;
  const top = 46;
  const height = top + dishes.length * rowH + 40;
  const x = (kcal: number) => left + (kcal / max) * (width - left - right);

  return <svg viewBox={`0 0 ${width} ${height}`} role="img"
    aria-label={`Диапазоны калорийности на 100 г: ${dishes.map((d) => `${d.name} — от ${d.kcal[0]} до ${d.kcal[1]} ккал`).join("; ")}`}>
    <rect width={width} height={height} fill="#fffefa" />
    {/* сетка по 100 ккал */}
    {[0, 100, 200, 300].map((kcal) => <g key={kcal}>
      <line x1={x(kcal)} y1={top - 16} x2={x(kcal)} y2={height - 34} stroke={LINE} strokeWidth="1" />
      <text x={x(kcal)} y={height - 14} fontSize="13" fill={MUTED} textAnchor="middle">{kcal}</text>
    </g>)}
    {/* Подпись оси — над сеткой справа: на одной строке с числами она
        наезжала на «300». */}
    <text x={width - right} y={26} fontSize="13" fill={MUTED} textAnchor="end">ккал / 100 г</text>
    {dishes.map((dish, i) => {
      const y = top + i * rowH;
      const mid = Math.round((dish.kcal[0] + dish.kcal[1]) / 2);
      return <g key={dish.slug}>
        <text x={left - 14} y={y + 22} fontSize="15" fill={INK} textAnchor="end" fontWeight="600">{dish.name}</text>
        <rect x={x(dish.kcal[0])} y={y + 8} width={x(dish.kcal[1]) - x(dish.kcal[0])} height="22" rx="11" fill={CORAL} opacity="0.85" />
        <line x1={x(mid)} y1={y + 4} x2={x(mid)} y2={y + 34} stroke={INK} strokeWidth="2" />
        <text x={x(dish.kcal[0]) - 6} y={y + 23} fontSize="12" fill={MUTED} textAnchor="end">{dish.kcal[0]}</text>
        <text x={x(dish.kcal[1]) + 6} y={y + 23} fontSize="12" fill={MUTED}>{dish.kcal[1]}</text>
      </g>;
    })}
    <text x={left} y={26} fontSize="13" fill={MUTED}>
      Полоса — реальный разброс рецептур; насечка — «то самое одно число» из таблиц
    </text>
  </svg>;
}

/**
 * Как адаптивная норма реагирует на тренд веса. Данные иллюстративные —
 * это схема механизма, а не чей-то дневник, о чём сказано в подписи фигуры.
 */
export function AdaptiveGoalChart() {
  const width = 760;
  const height = 260;
  const days = 28;
  const x = (d: number) => 70 + (d / (days - 1)) * (width - 100);
  // Первые две недели тренд строго горизонтален — «вес стоит» из подписи
  // должно читаться глазами, а не только из текста. После корректировки
  // линия уходит вниз (вниз по экрану = вес снижается).
  const trendY = (d: number) => (d < 14 ? 96 : 96 + (d - 14) * 4.2);
  const noise = [8, -6, 4, -9, 7, -3, 9, -7, 3, -8, 6, -4, 8, -6, 5, -9, 4, -6, 8, -3, 7, -8, 4, -6, 8, -4, 6, -7];

  const trendPath = Array.from({ length: days }, (_, d) => `${d ? "L" : "M"}${x(d).toFixed(1)} ${trendY(d).toFixed(1)}`).join(" ");

  return <svg viewBox={`0 0 ${width} ${height}`} role="img"
    aria-label="Схема: две недели вес стоит на месте, сервис предлагает уменьшить норму на 150 ккал, после чего тренд веса начинает снижаться">
    <rect width={width} height={height} fill="#fffefa" />
    {/* корректировка плана */}
    <line x1={x(14)} y1="52" x2={x(14)} y2={height - 46} stroke={LINE} strokeWidth="2" strokeDasharray="6 6" />
    <rect x={x(14) - 118} y="46" width="236" height="26" rx="13" fill={PAPER} stroke={LINE} />
    <text x={x(14)} y="64" fontSize="13" fill={INK} textAnchor="middle" fontWeight="600">план: −150 ккал к диапазону</text>
    {/* точки веса */}
    {noise.map((n, d) => <circle key={d} cx={x(d)} cy={trendY(d) + n} r="4" fill={INK} opacity="0.4" />)}
    {/* тренд */}
    <path d={trendPath} fill="none" stroke={CORAL} strokeWidth="5" strokeLinecap="round" />
    {/* подписи фаз */}
    <text x="70" y={height - 14} fontSize="13" fill={MUTED}>неделя 1–2: тренд стоит</text>
    <text x={width - 30} y={height - 14} fontSize="13" fill={MUTED} textAnchor="end">неделя 3–4: тренд пошёл вниз</text>
    <g>
      <circle cx="74" cy="22" r="4" fill={INK} opacity="0.4" />
      <text x="84" y="26" fontSize="12" fill={MUTED}>взвешивания</text>
      <line x1="180" y1="22" x2="206" y2="22" stroke={CORAL} strokeWidth="5" strokeLinecap="round" />
      <text x="214" y="26" fontSize="12" fill={MUTED}>сглаженный тренд веса</text>
    </g>
  </svg>;
}

/**
 * Итог сравнительной таблицы: сколько из десяти признаков закрывает каждое
 * приложение. Числа передаются из статьи — график лишь визуализирует ту же
 * таблицу и не должен знать ничего сверх неё.
 */
export function CompareScoreChart({ rows }: { rows: Array<{ name: string; score: number; ours?: boolean }> }) {
  const width = 760;
  const rowH = 56;
  const top = 40;
  const height = top + rows.length * rowH + 36;
  const left = 150;
  const max = 10;
  const x = (score: number) => left + (score / max) * (width - left - 40);

  return <svg viewBox={`0 0 ${width} ${height}`} role="img"
    aria-label={`Сколько из 10 признаков закрывает каждое приложение: ${rows.map((r) => `${r.name} — ${r.score}`).join("; ")}`}>
    <rect width={width} height={height} fill="#fffefa" />
    {[0, 2, 4, 6, 8, 10].map((s) => <g key={s}>
      <line x1={x(s)} y1={top - 12} x2={x(s)} y2={height - 30} stroke={LINE} strokeWidth="1" />
      <text x={x(s)} y={height - 10} fontSize="13" fill={MUTED} textAnchor="middle">{s}</text>
    </g>)}
    {rows.map((row, i) => {
      const y = top + i * rowH;
      return <g key={row.name}>
        <text x={left - 12} y={y + 21} fontSize="14" fill={INK} textAnchor="end" fontWeight={row.ours ? 800 : 500}>{row.name}</text>
        <rect x={left} y={y + 6} width={x(row.score) - left} height="20" rx="10"
          fill={row.ours ? CORAL : LIME} stroke={INK} strokeWidth={row.ours ? 2 : 1} />
        <text x={x(row.score) + 8} y={y + 21} fontSize="14" fill={INK} fontWeight="700">{row.score}</text>
      </g>;
    })}
    <text x={left} y={20} fontSize="13" fill={MUTED}>Закрыто признаков из 10 — по таблице выше</text>
  </svg>;
}
