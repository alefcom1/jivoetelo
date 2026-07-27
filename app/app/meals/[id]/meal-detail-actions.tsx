"use client";

import { useState } from "react";
import { deleteMeal, deleteMealPhoto } from "../../meal-actions";

export function MealDetailActions({ mealId, hasPhoto }: { mealId: number; hasPhoto: boolean }) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return <div className="meal-detail-actions">
    {hasPhoto && <button className="link-button" disabled={busy}
      onClick={() => run(() => deleteMealPhoto(mealId), "Удалить фото? Записанные данные о еде останутся.")}>
      Удалить фото
    </button>}
    <button className="danger-button" disabled={busy}
      onClick={() => run(() => deleteMeal(mealId), "Удалить этот приём пищи целиком?")}>
      Удалить запись
    </button>
  </div>;
}
