"use client";

// Калькулятор калорийности готового блюда.
//
// Ключевое отличие от «сложить ингредиенты» — вопрос про вес готового
// блюда. Без него пересчёт на 100 г врёт в разы: каша тяжелеет втрое, мясо
// теряет четверть, суп выкипает. Поэтому поле веса стоит не в углу
// «дополнительно», а прямо в потоке, и рядом объяснено, зачем взвешивать
// кастрюлю.

import { useState } from "react";
import { COOKING_LOSS, computeRecipe, searchFoods, type CookingKey, type RecipeItem } from "@/lib/recipe";

const START: RecipeItem[] = [
  { name: "Гречка отварная", grams: 400 },
  { name: "Куриная грудка отварная", grams: 300 },
  { name: "Морковь", grams: 100 },
];

export default function RecipeForm() {
  const [items, setItems] = useState<RecipeItem[]>(START);
  const [query, setQuery] = useState("");
  const [cooking, setCooking] = useState<CookingKey>("stew");
  const [cookedWeight, setCookedWeight] = useState<number | "">("");
  const [portion, setPortion] = useState(300);

  const found = searchFoods(query);
  const result = computeRecipe({
    items,
    cooking,
    cookedWeight: typeof cookedWeight === "number" ? cookedWeight : undefined,
    portionG: portion,
  });

  function addFood(name: string, portionG: number) {
    setItems((prev) => prev.some((i) => i.name === name) ? prev : [...prev, { name, grams: portionG }]);
    setQuery("");
  }

  return <div className="raschet-form" role="group" aria-label="Расчёт калорийности блюда">
    <fieldset>
      <legend>Что положили в блюдо</legend>
      <ul className="recipe-items">
        {items.map((item, index) => <li key={item.name}>
          <span className="recipe-item-name">{item.name}</span>
          <span className="recipe-item-grams">
            <input type="number" inputMode="numeric" min={1} max={5000} value={item.grams}
              aria-label={`Вес: ${item.name}`}
              onChange={(e) => {
                const grams = Math.min(5000, Math.max(1, Math.round(Number(e.target.value) || 0)));
                setItems((prev) => prev.map((it, i) => i === index ? { ...it, grams } : it));
              }} />
            <i>г</i>
          </span>
          <button type="button" className="recipe-remove" aria-label={`Убрать: ${item.name}`}
            onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}>×</button>
        </li>)}
        {items.length === 0 && <li className="recipe-empty">Добавьте хотя бы один продукт.</li>}
      </ul>

      <label className="field recipe-search">
        Добавить продукт
        <input type="search" value={query} placeholder="творог, гречка, масло…"
          onChange={(e) => setQuery(e.target.value)} />
      </label>
      {found.length > 0 && <ul className="recipe-results">
        {found.map((food) => <li key={food.name}>
          <button type="button" onClick={() => addFood(food.name, food.portionG)}>
            <b>{food.name}</b>
            <i>{food.kcal} ккал / 100 г</i>
          </button>
        </li>)}
      </ul>}
    </fieldset>

    <fieldset>
      <legend>Как готовили</legend>
      <div className="raschet-choice raschet-choice--stack">
        {COOKING_LOSS.map((step) => <button key={step.key} type="button"
          className={cooking === step.key ? "active" : ""} onClick={() => setCooking(step.key)}>
          {step.label} <i>масса ≈{Math.round(step.factor * 100)}% от исходной</i>
        </button>)}
      </div>
    </fieldset>

    <div className="raschet-fields">
      <label>
        Вес готового блюда, г <i className="field-optional">если взвесили</i>
        <input type="number" inputMode="numeric" min={0} max={20000} value={cookedWeight}
          placeholder={String(result.cookedWeight)}
          onChange={(e) => setCookedWeight(e.target.value === "" ? "" : Math.max(0, Math.round(Number(e.target.value) || 0)))} />
      </label>
      <label>
        Ваша порция, г
        <input type="number" inputMode="numeric" min={10} max={3000} value={portion}
          onChange={(e) => setPortion(Math.min(3000, Math.max(10, Math.round(Number(e.target.value) || 0))))} />
      </label>
    </div>

    <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">{result.perPortion.kcal} <span>ккал в порции {result.perPortion.grams} г</span></p>
        <div className="raschet-submetrics">
          <div><strong>{result.perPortion.protein} г</strong><span>Белки в порции</span></div>
          <div><strong>{result.perPortion.fat} г</strong><span>Жиры в порции</span></div>
          <div><strong>{result.perPortion.carbs} г</strong><span>Углеводы в порции</span></div>
          <div><strong>{result.perPortion.fiber} г</strong><span>Клетчатка</span></div>
        </div>

        <p className="raschet-adjusted">
          На 100 г готового блюда — <strong>{result.per100.kcal} ккал</strong>, белки {result.per100.protein} г,
          жиры {result.per100.fat} г, углеводы {result.per100.carbs} г. Во всём блюде {result.totals.kcal} ккал
          при весе {result.cookedWeight} г{typeof cookedWeight === "number" ? "" : " (оценка по способу готовки)"}.
        </p>
        <p className="raschet-hint">
          Сумма продуктов — {result.totals.rawWeight} г. Разница с весом готового и есть вода, которая
          ушла или пришла: калорий она не несёт, но именно из-за неё «ккал на 100 г» у сырой смеси и
          готового блюда различаются.
        </p>
      </div>
    </div>
  </div>;
}
