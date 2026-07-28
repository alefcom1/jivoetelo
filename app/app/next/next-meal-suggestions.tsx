"use client";

import { useState } from "react";
import type { MealSuggestion, SuggestionContext } from "@/lib/ai/suggest";
import { suggestNextMeal } from "../profile-actions";

export function NextMealSuggestions({ context, showCalories }: { context: SuggestionContext; showCalories: boolean }) {
  const [suggestions, setSuggestions] = useState<MealSuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const result = await suggestNextMeal(context);
      if (result.ok) setSuggestions(result.suggestions);
      else setError(result.error);
    } catch {
      setError("Что-то пошло не так. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  if (!suggestions) {
    return <div>
      {error && <p className="form-error">{error}</p>}
      <button className="black-button" onClick={load} disabled={busy}>{busy ? "Подбираем…" : "Подобрать варианты"}</button>
      {busy && <p className="addflow-hint">Обычно это занимает несколько секунд.</p>}
    </div>;
  }

  return <div className="suggestions">
    {suggestions.map((s) => <article className="suggestion" key={s.title}>
      <h3>{s.title}</h3>
      <p>{s.why}</p>
      <footer>
        {showCalories && <span>~{s.approxKcal} ккал</span>}
        <span>белок ~{s.approxProtein} г</span>
        <span>{s.timeMinutes <= 5 ? "почти без готовки" : `~${s.timeMinutes} мин`}</span>
      </footer>
    </article>)}
    <button className="link-button" onClick={load} disabled={busy}>{busy ? "Подбираем…" : "Показать другие"}</button>
    {error && <p className="form-error">{error}</p>}
  </div>;
}
