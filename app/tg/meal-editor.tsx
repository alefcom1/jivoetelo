"use client";

// Экран правки приёма пищи в «Дневнике»: порция, состав, удаление. Визуально
// это тот же черновик, что и в CameraTab (степпер, множители порции, крестик
// удаления позиции) — узнаваемое взаимодействие, хотя экран и API другие:
// здесь правится уже сохранённая запись, а не черновик свежего разбора.
//
// Позицию можно добавить и руками (app/tg/add-item.tsx). Раньше этого не
// было: считалось, что КБЖУ на 100 г взять неоткуда, кроме разбора. Теперь
// они берутся из справочника (lib/food-reference.ts) или вводятся с
// упаковки — и дневник наполняется даже с выключенным AI.

import { useEffect, useState } from "react";
import { CONFIDENCE_LABELS, type Confidence } from "@/lib/confidence";
import { scaleGrams } from "@/lib/portions";
import { AddItem, type NewItem } from "./add-item";
import { deleteMeal, fetchMealDetail, updateMeal, type DiaryMealItem, type MealDetail } from "./diary-api";
import { FoodIcon } from "../food-icon";
import { haptic } from "./telegram";
import { TgPhoto } from "./photo";

const MEAL_TYPES: Array<[string, string]> = [
  ["breakfast", "Завтрак"],
  ["lunch", "Обед"],
  ["dinner", "Ужин"],
  ["snack", "Перекус"],
];

export function MealEditor({
  mealId,
  showCalories,
  onBack,
  onChanged,
}: {
  mealId: number;
  showCalories: boolean;
  onBack: () => void;
  /** Запись сохранена или удалена — экран возвращается к списку дня, список нужно перезагрузить. */
  onChanged: () => void;
}) {
  const [meal, setMeal] = useState<MealDetail | null>(null);
  const [items, setItems] = useState<DiaryMealItem[] | null>(null);
  const [mealType, setMealType] = useState("other");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMealDetail(mealId)
      .then((result) => {
        if (cancelled) return;
        setMeal(result);
        setItems(result.items);
        setMealType(result.mealType);
      })
      .catch(() => { if (!cancelled) setError("Не получилось загрузить запись."); });
    return () => { cancelled = true; };
  }, [mealId]);

  function updateItem(index: number, patch: Partial<DiaryMealItem>) {
    setItems((current) => current && current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  /**
   * Добавленной руками позиции идентификатора из базы ещё нет. Выдаём
   * отрицательный и убывающий — он нужен только React, чтобы различать
   * строки списка; на сервер он не уходит, `updateMeal` отправляет состав
   * целиком и без идентификаторов. Отрицательный, чтобы никогда не совпасть
   * с настоящим, и убывающий, чтобы не совпасть с уже выданным после того,
   * как какую-то из позиций убрали.
   */
  function addItem(item: NewItem) {
    setItems((current) => {
      const list = current ?? [];
      const minId = Math.min(0, ...list.map((existing) => existing.id));
      return [...list, { ...item, id: minId - 1 }];
    });
  }

  async function handleSave() {
    if (!items || items.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await updateMeal(mealId, {
        mealType,
        items: items.map((item) => ({
          name: item.name,
          grams: item.grams,
          kcalPer100: item.kcalPer100,
          proteinPer100: item.proteinPer100,
          fatPer100: item.fatPer100,
          carbsPer100: item.carbsPer100,
          fiberPer100: item.fiberPer100,
          confidence: item.confidence,
        })),
      });
      haptic("success");
      onChanged();
    } catch {
      haptic("error");
      setError("Не получилось сохранить. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Удалить этот приём пищи целиком?")) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMeal(mealId);
      haptic("success");
      onChanged();
    } catch {
      haptic("error");
      setError("Не получилось удалить запись.");
    } finally {
      setDeleting(false);
    }
  }

  if (!meal || !items) {
    return <div className="tg-page">
      <button className="tg-link-button" onClick={onBack}>← Дневник</button>
      <header className="tg-hero"><h1>Запись</h1></header>
      {error ? <p className="tg-error">{error}</p> : <div className="tg-spinner" aria-label="Загрузка" />}
    </div>;
  }

  // Итоги считаем по текущему (возможно, ещё не сохранённому) составу — тот
  // же расчёт, что в CameraTab, чтобы число под списком сразу отражало правки.
  const totals = items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + Math.round((item.kcalPer100 * item.grams) / 100),
      protein: acc.protein + (item.proteinPer100 * item.grams) / 100,
      fiber: acc.fiber + (item.fiberPer100 * item.grams) / 100,
    }),
    { kcal: 0, protein: 0, fiber: 0 },
  );

  return <div className="tg-page">
    <button className="tg-link-button" onClick={onBack}>← Дневник</button>
    <header className="tg-hero">
      <p className="tg-kicker">{meal.eatenTime}</p>
      <h1>Правка записи</h1>
    </header>

    {meal.photoKey && <div className="tg-photo">
      <div className="tg-photo-drop">
        <TgPhoto photoKey={meal.photoKey} alt="Фото приёма пищи" variant="wide" />
      </div>
    </div>}
    {meal.sourceText && <p className="tg-hint">«{meal.sourceText}»</p>}

    <ul className="tg-draft">
      {items.map((item, index) => <li key={item.id}>
        <div className="tg-draft-row">
          <FoodIcon name={item.name} size="sm" />
          <b>{item.name}</b>
          <div className="tg-stepper">
            <button aria-label="Меньше" onClick={() => { haptic("tap"); updateItem(index, { grams: Math.max(1, item.grams - 10) }); }}>−</button>
            <span>{item.grams} г</span>
            <button aria-label="Больше" onClick={() => { haptic("tap"); updateItem(index, { grams: Math.min(3000, item.grams + 10) }); }}>+</button>
          </div>
        </div>
        <div className="tg-portions">
          <button type="button" onClick={() => { haptic("tap"); updateItem(index, { grams: scaleGrams(item.grams, 0.5) }); }} aria-label="Уменьшить порцию вдвое">½</button>
          <button type="button" onClick={() => { haptic("tap"); updateItem(index, { grams: scaleGrams(item.grams, 0.75) }); }} aria-label="Уменьшить порцию на четверть">¾</button>
          <button type="button" onClick={() => { haptic("tap"); updateItem(index, { grams: scaleGrams(item.grams, 1.5) }); }} aria-label="Увеличить порцию в полтора раза">1½</button>
          <button type="button" onClick={() => { haptic("tap"); updateItem(index, { grams: scaleGrams(item.grams, 2) }); }} aria-label="Увеличить порцию вдвое">2×</button>
        </div>
        <div className="tg-draft-meta">
          {item.confidence !== "high" && <i>{CONFIDENCE_LABELS[(item.confidence as Confidence) ?? "medium"]}</i>}
          {showCalories && <span>{Math.round((item.kcalPer100 * item.grams) / 100)} ккал</span>}
          <span>белок {Math.round((item.proteinPer100 * item.grams) / 10) / 10} г</span>
          <button className="tg-remove" aria-label="Убрать позицию"
            onClick={() => { haptic("tap"); setItems((c) => c && c.filter((_, i) => i !== index)); }}>×</button>
        </div>
      </li>)}
    </ul>
    {items.length === 0 && <p className="tg-hint">Все позиции убраны — сохранить нечего. Верните позицию назад или удалите запись целиком.</p>}

    <AddItem onAdd={addItem} />

    <div className="tg-card tg-draft-total">
      <div className="tg-draft-total-row">
        {showCalories && <div><strong>{totals.kcal}</strong><span>ккал</span></div>}
        <div><strong>{Math.round(totals.protein * 10) / 10}</strong><span>белок, г</span></div>
        <div><strong>{Math.round(totals.fiber * 10) / 10}</strong><span>клетчатка, г</span></div>
      </div>
    </div>

    <div className="tg-segment tg-segment-wrap">
      {MEAL_TYPES.map(([value, label]) => <button key={value} className={mealType === value ? "active" : ""}
        onClick={() => { haptic("tap"); setMealType(value); }}>{label}</button>)}
    </div>

    {error && <p className="tg-error">{error}</p>}
    <button className="tg-button tg-button-block" onClick={() => void handleSave()} disabled={saving || deleting || items.length === 0}>
      {saving ? "Сохраняем…" : "Сохранить изменения"}
    </button>
    <button className="tg-link-button" onClick={() => void handleDelete()} disabled={saving || deleting}>
      {deleting ? "Удаляем…" : "Удалить запись"}
    </button>
  </div>;
}
