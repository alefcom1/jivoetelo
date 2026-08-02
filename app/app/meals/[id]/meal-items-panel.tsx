"use client";

// Состав приёма пищи в кабинете: сначала таблицей, по кнопке — правкой.
//
// Почему это один компонент, а не таблица на сервере плюс форма рядом. Числа
// в таблице и числа в форме — одни и те же; разведи их по двум компонентам,
// и после сохранения таблица покажет старое, пока страница не перезагрузится.
// Здесь состояние одно, и «Сохранить» меняет обе стороны сразу.
//
// Разметка правки намеренно повторяет черновик из app/app/add/add-meal-flow.tsx
// (`.draft-item`, `.per100-grid`): человек уже правил состав ровно так при
// сохранении записи, и второй, свой собственный способ править то же самое
// пришлось бы осваивать заново. Стили тоже переиспользуются — новых нет.

import { useState } from "react";
import { CONFIDENCE_LABELS, type Confidence } from "@/lib/confidence";
import { MEAL_TYPE_LABELS } from "@/lib/dates";
import { isBlankNutrition, itemTotals, sumTotals } from "@/lib/nutrition";
import { scaleGrams } from "@/lib/portions";
import { updateMealItems } from "../../meal-actions";

export type EditableItem = {
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  confidence: string;
};

function emptyItem(): EditableItem {
  return {
    name: "",
    grams: 100,
    kcalPer100: 0,
    proteinPer100: 0,
    fatPer100: 0,
    carbsPer100: 0,
    fiberPer100: 0,
    // Позиция, введённая руками, — не догадка модели, а знание человека.
    confidence: "high",
  };
}

export function MealItemsPanel({
  mealId,
  showCalories,
  initialItems,
  initialMealType,
  initialTime,
}: {
  mealId: number;
  showCalories: boolean;
  initialItems: EditableItem[];
  initialMealType: string;
  initialTime: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [mealType, setMealType] = useState(initialMealType);
  const [time, setTime] = useState(initialTime);
  // Черновик правки держится отдельно от сохранённого состояния: «Отмена»
  // должна возвращать к последнему сохранённому, а не к последнему набранному.
  const [draft, setDraft] = useState<{ items: EditableItem[]; mealType: string; time: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = draft?.items ?? items;
  const totals = sumTotals(shown);

  function patch(index: number, change: Partial<EditableItem>) {
    setDraft((current) =>
      current && { ...current, items: current.items.map((item, i) => (i === index ? { ...item, ...change } : item)) },
    );
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const result = await updateMealItems({
      mealId,
      mealType: draft.mealType,
      eatenTime: draft.time,
      items: draft.items,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Не получилось сохранить.");
      return;
    }
    setItems(draft.items);
    setMealType(draft.mealType);
    setTime(draft.time);
    setDraft(null);
  }

  if (!draft) {
    return <>
      <table className="meal-items">
        <thead><tr><th>Позиция</th><th>Вес</th>{showCalories && <th>ккал</th>}<th>Белок</th><th>Клетчатка</th></tr></thead>
        <tbody>
          {items.map((item, index) => {
            const t = itemTotals(item);
            return <tr key={index}>
              <td>
                {item.name}
                {/* «0 ккал» у еды почти всегда значит не «еда без калорий», а
                    «числа не ввели». Пока это молчаливый ноль, человек считает
                    его данными и правит не то. */}
                {isBlankNutrition(item)
                  ? <i> · числа не заполнены</i>
                  : item.confidence === "low" && <i> · неточно</i>}
              </td>
              <td>{item.grams} г</td>
              {showCalories && <td>{t.kcal}</td>}
              <td>{t.protein} г</td>
              <td>{t.fiber} г</td>
            </tr>;
          })}
        </tbody>
        <tfoot>
          <tr><td>Итого</td><td />{showCalories && <td>{totals.kcal}</td>}<td>{totals.protein} г</td><td>{totals.fiber} г</td></tr>
        </tfoot>
      </table>
      <div className="meal-detail-actions">
        <button className="black-button" onClick={() => { setError(null); setDraft({ items, mealType, time }); }}>
          Править запись
        </button>
      </div>
    </>;
  }

  return <div className="meal-edit">
    <div className="draft-items">
      {draft.items.map((item, index) => <div className="draft-item" key={index}>
        <div className="draft-item-main">
          <input type="text" value={item.name} aria-label="Название" placeholder="Название"
            onChange={(e) => patch(index, { name: e.target.value })} />
          <label className="draft-grams">
            <input type="number" min={1} max={3000} value={item.grams} aria-label="Вес в граммах"
              onChange={(e) => patch(index, { grams: Number(e.target.value) })} /> г
          </label>
          <button className="draft-remove" aria-label="Убрать позицию"
            onClick={() => setDraft((c) => c && { ...c, items: c.items.filter((_, i) => i !== index) })}>×</button>
        </div>
        <div className="portion-multipliers">
          <button type="button" onClick={() => patch(index, { grams: scaleGrams(item.grams, 0.5) })} aria-label="Уменьшить порцию вдвое">½</button>
          <button type="button" onClick={() => patch(index, { grams: scaleGrams(item.grams, 0.75) })} aria-label="Уменьшить порцию на четверть">¾</button>
          <button type="button" onClick={() => patch(index, { grams: scaleGrams(item.grams, 1.5) })} aria-label="Увеличить порцию в полтора раза">1½</button>
          <button type="button" onClick={() => patch(index, { grams: scaleGrams(item.grams, 2) })} aria-label="Увеличить порцию вдвое">2×</button>
        </div>
        <div className="draft-item-meta">
          {isBlankNutrition(item)
            ? <i>числа не заполнены</i>
            : item.confidence !== "high" && <i>{CONFIDENCE_LABELS[(item.confidence as Confidence) ?? "medium"]}</i>}
          {showCalories && <span>{Math.round((item.kcalPer100 * item.grams) / 100)} ккал</span>}
          <span>белок {Math.round((item.proteinPer100 * item.grams) / 10) / 10} г</span>
          {/* Раскрыто по умолчанию: на этот экран приходят чинить именно
              числа, и прятать их за ещё одним нажатием здесь незачем. */}
          <details open>
            <summary>на 100 г</summary>
            <div className="per100-grid">
              <label>ккал<input type="number" min={0} max={900} value={item.kcalPer100}
                onChange={(e) => patch(index, { kcalPer100: Number(e.target.value) })} /></label>
              <label>белки<input type="number" min={0} max={100} value={item.proteinPer100}
                onChange={(e) => patch(index, { proteinPer100: Number(e.target.value) })} /></label>
              <label>жиры<input type="number" min={0} max={100} value={item.fatPer100}
                onChange={(e) => patch(index, { fatPer100: Number(e.target.value) })} /></label>
              <label>углеводы<input type="number" min={0} max={100} value={item.carbsPer100}
                onChange={(e) => patch(index, { carbsPer100: Number(e.target.value) })} /></label>
              <label>клетчатка<input type="number" min={0} max={50} value={item.fiberPer100}
                onChange={(e) => patch(index, { fiberPer100: Number(e.target.value) })} /></label>
            </div>
          </details>
        </div>
      </div>)}
      <button className="link-button" onClick={() => setDraft((c) => c && { ...c, items: [...c.items, emptyItem()] })}>
        + Добавить позицию
      </button>
    </div>

    <div className="draft-summary">
      {showCalories && <div><strong>{totals.kcal}</strong><span>ккал</span></div>}
      <div><strong>{totals.protein}</strong><span>белок, г</span></div>
      <div><strong>{totals.fiber}</strong><span>клетчатка, г</span></div>
    </div>

    <div className="draft-meta">
      <label>Приём
        <select value={draft.mealType} onChange={(e) => setDraft((c) => c && { ...c, mealType: e.target.value })}>
          {Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Время<input type="time" value={draft.time}
        onChange={(e) => setDraft((c) => c && { ...c, time: e.target.value })} /></label>
    </div>

    {draft.items.length === 0 && <p className="field-note">
      Все позиции убраны — сохранять нечего. Верните позицию или удалите запись целиком внизу страницы.
    </p>}
    {error && <p className="form-error">{error}</p>}
    <div className="addflow-actions">
      <button className="black-button" onClick={() => void save()} disabled={busy || draft.items.length === 0}>
        {busy ? "Сохраняем…" : "Сохранить"}
      </button>
      <button className="link-button" onClick={() => { setDraft(null); setError(null); }} disabled={busy}>Отмена</button>
    </div>
  </div>;
}
