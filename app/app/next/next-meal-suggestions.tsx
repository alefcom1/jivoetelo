"use client";

import { useState } from "react";
import type { MealSuggestion } from "@/lib/ai/suggest";
import { suggestNextMeal, type SuggestionHints } from "../profile-actions";

export function NextMealSuggestions({ context, showCalories }: { context: SuggestionHints; showCalories: boolean }) {
  const [suggestions, setSuggestions] = useState<MealSuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Счётчик заходов: каждое «Показать другие» просит подбор посмотреть на
  // еду с другой стороны, иначе повторное нажатие даёт то же самое.
  const [round, setRound] = useState(0);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const result = await suggestNextMeal({ ...context, round });
      setRound((current) => current + 1);
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
