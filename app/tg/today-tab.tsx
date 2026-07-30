"use client";

import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { withPluralRu } from "@/lib/plural";
import type { TodayResponse } from "./api";
import { IconInbox, IconToday } from "./icons";
import { SuggestCard } from "./suggest-card";
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
    </div>
  </div>;
}

function Bar({ label, value, target, unit }: { label: string; value: number; target: number | null; unit: string }) {
  const pct = target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return <div className="tg-bar">
    <div className="tg-bar-head">
      <span>{label}</span>
      <b>{value}{target ? <i> / {target}</i> : null} {unit}</b>
    </div>
    {target ? <div className="tg-bar-track"><div className="tg-bar-fill" style={{ width: `${pct}%` }} /></div> : null}
  </div>;
}

export function TodayTab({
  data,
  firstName,
  onOpenCamera,
  onOpenInbox,
}: {
  data: TodayResponse;
  firstName: string | null;
  onOpenCamera: () => void;
  onOpenInbox: () => void;
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
      {showCalories && !kcalMid && <Bar label="Энергия" value={totals.kcal} target={null} unit="ккал" />}
      <Bar label="Белок" value={totals.protein} target={targets?.proteinTarget ?? null} unit="г" />
      <Bar label="Жиры" value={totals.fat} target={targets?.fatTarget ?? null} unit="г" />
      <Bar label="Углеводы" value={totals.carbs} target={targets?.carbsTarget ?? null} unit="г" />
      <Bar label="Клетчатка" value={totals.fiber} target={targets?.fiberTarget ?? null} unit="г" />
    </section>

    {!targets && <section className="tg-card tg-hint-card">
      <p>Настройте стартовый план в веб-версии — и здесь появятся цели по энергии и белку.</p>
      <a className="tg-link" href="/app/onboarding" target="_blank" rel="noreferrer">Настроить план →</a>
    </section>}

    <WeightTrend weight={data.weight} />

    {/* Строка инбокса — только если снимки правда ждут; пустой инбокс на
        «Сегодня» не упоминается вовсе (раздел «Три отличия от макета»,
        пункт 2). Формулировка про «не успели подтвердить», а не «разберём
        позже»: на практике люди пропускают не разбор, а подтверждение. */}
    {data.inboxPending > 0 && <button className="tg-inbox-banner" onClick={onOpenInbox}>
      <IconInbox />
      <span>Не успели подтвердить: {withPluralRu(data.inboxPending, ["снимок", "снимка", "снимков"])}</span>
      <b>→</b>
    </button>}

    <SuggestCard showCalories={showCalories} />

    <section className="tg-section">
      <h2>Приёмы пищи</h2>
      {data.meals.length === 0
        ? <div className="tg-empty">
            <IconToday />
            <p>Пока пусто. Запишите первый приём — это займёт меньше минуты.</p>
            <button className="tg-button" onClick={onOpenCamera}>Снять еду</button>
          </div>
        : <ul className="tg-meals">
            {data.meals.map((meal) => <li key={meal.id}>
              <time>{meal.time}</time>
              <div>
                <b>{meal.title}</b>
                <span>{meal.items.slice(0, 3).join(", ")}</span>
              </div>
              <strong>
                {showCalories && <>{meal.kcal}<small> ккал</small></>}
                <em>{meal.protein} г белка</em>
              </strong>
            </li>)}
          </ul>}
    </section>

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
