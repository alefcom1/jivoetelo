"use client";

// Недельный обзор в Mini App.
//
// До этого «План» заканчивался строкой «Полный недельный обзор — в
// веб-версии»: человек, который живёт в Telegram, разбора своей недели не
// видел вовсе, а вместе с ним не видел и предложения по корректировке плана —
// то есть самого механизма адаптивной цели.
//
// Данные и текст те же, что на вебе (lib/review-data.ts, lib/review.ts):
// секции здесь не собираются заново, иначе два клиента через месяц правок
// рассказывали бы про одну неделю разное.

import { useEffect, useState } from "react";
import { formatKcalChange } from "@/lib/adaptive";
import { formatDayRu } from "@/lib/dates";
import { applyPlanProposal, fetchReview, type ReviewResponse } from "./plan-profile-api";
import { haptic } from "./telegram";

export function ReviewScreen({ showCalories, onBack }: { showCalories: boolean; onBack: () => void }) {
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  /** Что вышло из подтверждения поправки — показываем вместо кнопки. */
  const [applied, setApplied] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReview()
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setError("Не получилось загрузить обзор."); });
    return () => { cancelled = true; };
  }, []);

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const result = await applyPlanProposal();
      haptic("success");
      // Сервер мог не найти предложения — например, за это время появился
      // новый замер веса. Молча показать «применено» в таком случае нельзя.
      if (result.applied === null) setError("Предложение устарело — откройте обзор заново.");
      else setApplied(result.applied);
    } catch {
      haptic("error");
      setError("Не получилось применить.");
    } finally {
      setApplying(false);
    }
  }

  if (!data) {
    return <div className="tg-page">
      <button className="tg-link-button" onClick={onBack}>← План</button>
      <header className="tg-hero"><h1>Недельный обзор</h1></header>
      {error ? <p className="tg-error">{error}</p> : <div className="tg-spinner" aria-label="Загрузка" />}
    </div>;
  }

  const { review, targets, proposal, weekStart, weekEnd, mealStats, impact } = data;

  return <div className="tg-page">
    <button className="tg-link-button" onClick={onBack}>← План</button>
    <header className="tg-hero">
      <p className="tg-kicker">{formatDayRu(weekStart)} — {formatDayRu(weekEnd)}</p>
      <h1>Недельный обзор</h1>
    </header>

    <div className="tg-card tg-draft-total-row">
      <div><strong>{review.daysLogged}</strong><span>дней с записями</span></div>
      <div><strong>{mealStats.mealCount}</strong><span>приёмов пищи</span></div>
      {showCalories && review.avgKcal !== null && <div><strong>{review.avgKcal}</strong><span>ккал в среднем</span></div>}
      {review.avgProtein !== null && <div><strong>{review.avgProtein}</strong><span>белок, г</span></div>}
    </div>

    {review.sections.map((section) => <section className="tg-section tg-review-section" key={section.title}>
      <h2>{section.title}</h2>
      <p>{section.text}</p>
    </section>)}

    {impact && <section className="tg-section tg-review-section">
      <h2>{impact.title}</h2>
      <p>{impact.text}</p>
    </section>}

    {proposal && targets && <section className="tg-card tg-review-proposal">
      <p className="tg-kicker">Предложение по плану</p>
      <p>{proposal.reason}</p>
      <p className="tg-hint">
        Сейчас ~{targets.kcalTarget} ккал, вероятный диапазон {targets.kcalMin}–{targets.kcalMax}.
        Изменение применится только после подтверждения, и его всегда можно откатить в профиле.
      </p>
      {applied === null
        ? <button className="tg-button tg-button-block" onClick={() => void apply()} disabled={applying}>
            {applying ? "Применяем…" : `Применить ${formatKcalChange(proposal.deltaKcal)} ккал`}
          </button>
        : <p className="tg-hint">Готово: {formatKcalChange(applied)} ккал. Новая цель появится на «Плане».</p>}
      {error && <p className="tg-error">{error}</p>}
    </section>}

    {/* Ошибка загрузки предложения показывается внутри блока выше, но ошибка
        без блока (обзор загрузился, предложения нет) осталась бы невидимой. */}
    {error && !proposal && <p className="tg-error">{error}</p>}
  </div>;
}
