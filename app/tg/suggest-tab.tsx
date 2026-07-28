"use client";

import { useState } from "react";
import { fetchSuggestions, type SuggestResponse } from "./api";
import { haptic } from "./telegram";

export function SuggestTab({ showCalories }: { showCalories: boolean }) {
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const result = await fetchSuggestions();
      haptic("tap");
      setData(result);
    } catch (err) {
      haptic("error");
      setError(err instanceof Error && err.message !== "error" ? err.message : "Не получилось подобрать варианты.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="tg-page">
    <header className="tg-hero">
      <h1>Что съесть дальше?</h1>
      <p className="tg-hint">
        {data?.context
          ? showCalories
            ? `Остаток на сегодня: около ${data.context.remainingKcal} ккал, белка ${data.context.remainingProtein} г, клетчатки ${data.context.remainingFiber} г.`
            : `Сегодня стоит добрать белка ${data.context.remainingProtein} г и клетчатки ${data.context.remainingFiber} г.`
          : "Подберём вариант под остаток вашего дня."}
      </p>
    </header>

    {data?.needsPlan && <div className="tg-card tg-hint-card">
      <p>Чтобы подбирать варианты под ваш день, настройте стартовый план в веб-версии.</p>
      <a className="tg-link" href="/app/onboarding" target="_blank" rel="noreferrer">Настроить план →</a>
    </div>}

    {data && !data.needsPlan && <div className="tg-suggestions">
      {data.suggestions.map((suggestion) => <article className="tg-card tg-suggestion" key={suggestion.title}>
        <h3>{suggestion.title}</h3>
        <p>{suggestion.why}</p>
        <footer>
          {showCalories && <span>~{suggestion.approxKcal} ккал</span>}
          <span>белок ~{suggestion.approxProtein} г</span>
          <span>{suggestion.timeMinutes <= 5 ? "почти без готовки" : `~${suggestion.timeMinutes} мин`}</span>
        </footer>
      </article>)}
    </div>}

    {error && <p className="tg-error">{error}</p>}

    <button className="tg-button tg-button-block" onClick={() => void load()} disabled={busy}>
      {busy ? "Подбираем…" : data ? "Показать другие" : "Подобрать варианты"}
    </button>
  </div>;
}
