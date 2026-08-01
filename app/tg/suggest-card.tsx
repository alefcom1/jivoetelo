"use client";

import { useState } from "react";
import { fetchSuggestions, type SuggestResponse } from "./api";
import { FoodIcon } from "../food-icon";
import { IconSuggest } from "./icons";
import { haptic } from "./telegram";

/**
 * «Что съесть сейчас» — карточка на «Сегодня», а не отдельная вкладка
 * (раздел «Три отличия от макета» спецификации Mini App v2). Запрос идёт по
 * кнопке, не сам при заходе на экран: подсказка обращается к AI и тратит
 * дневную квоту (`/api/tg/suggest` уже проверяет её через `checkQuota`), а
 * не каждому открытию «Сегодня» это нужно.
 */
export function SuggestCard({ showCalories }: { showCalories: boolean }) {
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

  return <section className="tg-card tg-suggest-card">
    <header className="tg-suggest-card-head">
      <IconSuggest active />
      <h2>Что съесть сейчас</h2>
    </header>

    {!data && <p className="tg-hint">Подберём вариант под остаток вашего дня.</p>}

    {data?.needsPlan && <p className="tg-hint">Чтобы подбирать варианты под ваш день, настройте план в веб-версии.</p>}

    {data && !data.needsPlan && <ul className="tg-suggestions">
      {data.suggestions.map((suggestion) => <li className="tg-suggestion" key={suggestion.title}>
        <FoodIcon name={suggestion.title} size="lg" />
        <div className="tg-suggestion-body">
          <h3>{suggestion.title}</h3>
          <p>{suggestion.why}</p>
          <footer>
            {showCalories && <span>~{suggestion.approxKcal} ккал</span>}
            <span>белок ~{suggestion.approxProtein} г</span>
            <span>{suggestion.timeMinutes <= 5 ? "почти без готовки" : `~${suggestion.timeMinutes} мин`}</span>
          </footer>
        </div>
      </li>)}
    </ul>}

    {error && <p className="tg-error">{error}</p>}

    <button className="tg-button" onClick={() => void load()} disabled={busy}>
      {busy ? "Подбираем…" : data ? "Показать другие" : "Подобрать"}
    </button>
  </section>;
}
