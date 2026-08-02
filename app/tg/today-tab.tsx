"use client";

import { mealCategory } from "@/lib/food-category";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { withPluralRu } from "@/lib/plural";
import type { TgMeal, TodayResponse } from "./api";
import { FoodIcon, foodTint } from "../food-icon";
import { IconInbox } from "./icons";
import { ArtEmptyPlate } from "./illustrations";
import { TgPhoto } from "./photo";
import { SuggestCard } from "./suggest-card";
import { haptic } from "./telegram";
import { WeightTrend } from "./weight-trend";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

/** Кольцо прогресса: доля от середины целевого диапазона. */
function ProgressRing({ value, max, label, unit }: { value: number; max: number; label: string; unit: string }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return <div className="tg-ring">
    <svg viewBox="0 0 120 120" role="img" aria-label={`${label}: ${value} из ${max} ${unit}`}>
      <defs>
        {/* Градиент по дуге, а не плоская заливка: кольцо — главный объект
            экрана, и объём здесь работает на него. Координаты в userSpace,
            иначе градиент считался бы от bounding box самой дуги и на малом
            заполнении сжимался бы в одно пятно. */}
        <linearGradient id="tg-ring-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="120" y2="120">
          <stop offset="0%" stopColor="var(--brand-coral)" />
          <stop offset="100%" stopColor="hsl(38 90% 58%)" />
        </linearGradient>
      </defs>
      <circle className="tg-ring-track" cx="60" cy="60" r={radius} />
      <circle
        className="tg-ring-value"
        cx="60" cy="60" r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
      />
    </svg>
    <div className="tg-ring-center">
      <strong>{value}</strong>
      <span>из {max} {unit}</span>
      {max > 0 && <em>{Math.round((value / max) * 100)}%</em>}
    </div>
  </div>;
}

type MacroKey = "energy" | "protein" | "fat" | "carbs" | "fiber";

function Bar({ label, value, target, unit, macro }: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
  macro: MacroKey;
}) {
  const pct = target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return <div className={`tg-bar tg-bar--${macro}`}>
    <div className="tg-bar-head">
      <span>{label}</span>
      <b>{value}{target ? <i> / {target}</i> : null} {unit}</b>
    </div>
    {target ? <div className="tg-bar-track"><div className="tg-bar-fill" style={{ width: `${pct}%` }} /></div> : null}
  </div>;
}

/**
 * Миниатюра приёма пищи: настоящий снимок, если человек его сделал, иначе
 * значок категории блюда. Пустой серой плашки на этом месте больше нет —
 * ради неё и заведён набор в app/tg/food-icon.tsx.
 */
function MealThumb({ meal }: { meal: TgMeal }) {
  const category = mealCategory(meal.items);
  return <span className="tg-meal-thumb" style={foodTint(category)}>
    {meal.photoKey
      ? <TgPhoto photoKey={meal.photoKey} alt="" />
      : <FoodIcon category={category} size="md" />}
  </span>;
}

export function TodayTab({
  data,
  firstName,
  onOpenCamera,
  onOpenInbox,
  onOpenMeal,
  onReload,
}: {
  data: TodayResponse;
  firstName: string | null;
  onOpenCamera: () => void;
  onOpenInbox: () => void;
  /** Правка приёма пищи живёт в «Дневнике» — туда и уводим. */
  onOpenMeal: (mealId: number) => void;
  /** Перечитать день: после замера веса тренд на этом же экране устарел. */
  onReload: () => void;
}) {
  const { totals, targets, showCalories } = data;
  const kcalMid = targets?.kcalTarget ?? null;

  return <div className="tg-page">
    <header className="tg-hero">
      <p className="tg-kicker">{greeting()}{firstName ? `, ${firstName}` : ""}</p>
      <h1>{showCalories && kcalMid
        ? totals.kcal >= kcalMid ? "День набран." : "Ваш день идёт."
        : "Ваш день идёт."}</h1>
    </header>

    {/* Калории и макросы — крупно и сразу, без раскрытия (раздел «Три отличия
        от макета» спецификации Mini App v2, пункт 1). */}
    {showCalories && kcalMid
      ? <ProgressRing value={totals.kcal} max={kcalMid} label="Энергия" unit="ккал" />
      : null}

    <section className="tg-card tg-macros">
      {showCalories && !kcalMid && <Bar macro="energy" label="Энергия" value={totals.kcal} target={null} unit="ккал" />}
      <Bar macro="protein" label="Белок" value={totals.protein} target={targets?.proteinTarget ?? null} unit="г" />
      <Bar macro="fat" label="Жиры" value={totals.fat} target={targets?.fatTarget ?? null} unit="г" />
      <Bar macro="carbs" label="Углеводы" value={totals.carbs} target={targets?.carbsTarget ?? null} unit="г" />
      <Bar macro="fiber" label="Клетчатка" value={totals.fiber} target={targets?.fiberTarget ?? null} unit="г" />
    </section>

    {!targets && <section className="tg-card tg-hint-card">
      <p>Настройте стартовый план в веб-версии — и здесь появятся цели по энергии и белку.</p>
      <a className="tg-link" href="/app/onboarding" target="_blank" rel="noreferrer">Настроить план →</a>
    </section>}

    {/* Строка инбокса — только если снимки правда ждут; пустой инбокс на
        «Сегодня» не упоминается вовсе (раздел «Три отличия от макета»,
        пункт 2). Формулировка про «не успели подтвердить», а не «разберём
        позже»: на практике люди пропускают не разбор, а подтверждение. */}
    {data.inboxPending > 0 && <button className="tg-inbox-banner" onClick={onOpenInbox}>
      <IconInbox />
      <span>Не успели подтвердить: {withPluralRu(data.inboxPending, ["снимок", "снимка", "снимков"])}</span>
      <b>→</b>
    </button>}

    <section className="tg-section">
      <h2>Приёмы пищи</h2>
      {data.meals.length === 0
        ? <div className="tg-empty">
            <ArtEmptyPlate />
            <p>Пока пусто. Запишите первый приём — это займёт меньше минуты.</p>
            <button className="tg-button" onClick={onOpenCamera}>Снять еду</button>
          </div>
        : <ul className="tg-meals">
            {/* Строка — кнопка: нажатие открывает правку. Раньше по ней не
                происходило ничего, хотя выглядела она ровно как список в
                «Дневнике», где нажатие работает. Молчащий элемент, похожий
                на рабочий, хуже отсутствующего. */}
            {data.meals.map((meal) => <li key={meal.id}>
              <button className="tg-meal-row" onClick={() => { haptic("tap"); onOpenMeal(meal.id); }}>
                <MealThumb meal={meal} />
                <div>
                  <b>{meal.title} <time>{meal.time}</time></b>
                  <span>{meal.items.slice(0, 3).join(", ")}</span>
                </div>
                <strong>
                  {showCalories && <>{meal.kcal}<small> ккал</small></>}
                  <em>{meal.protein} г белка</em>
                </strong>
              </button>
            </li>)}
          </ul>}
    </section>

    {/* Порядок блоков: сначала день, потом что в нём уже есть, потом
        подсказка на остаток, и только в конце вес. Вес — итог недели, а не
        новость дня: наверху он отвечал на вопрос, которого человек в этот
        момент не задаёт. */}
    <SuggestCard showCalories={showCalories} />

    <WeightTrend weight={data.weight} onAdded={onReload} />

    {/* Дисклеймер и документы должны быть доступны и внутри Telegram, а не
        только на сайте: для части людей Mini App — единственный вход. */}
    <footer className="tg-legal">
      <p>{NOT_MEDICAL_DISCLAIMER}</p>
      <div>
        <a href="/legal/health" target="_blank" rel="noreferrer">Границы сервиса</a>
        <a href="/legal/terms" target="_blank" rel="noreferrer">Соглашение</a>
        <a href="/legal/privacy" target="_blank" rel="noreferrer">Конфиденциальность</a>
      </div>
    </footer>
  </div>;
}
