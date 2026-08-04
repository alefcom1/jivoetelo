"use client";

// Пересчёт рецепта на другое число порций. Арифметика тривиальная, поэтому
// вся ценность — в двух вещах: удобном вводе ингредиентов (поиск по нашему
// справочнику, как в калькуляторе блюда) и в том, что мы показываем КБЖУ
// порции и явно говорим, что при пересчёте оно не меняется. Именно этого
// человек чаще всего и опасается.

import { useState } from "react";
import { findFood, scaleRecipe, searchFoods, type RecipeItem } from "@/lib/recipe";
import { ru } from "../format";

const STARTER: RecipeItem[] = [
  { name: "Гречка отварная", grams: 400 },
  { name: "Говядина отварная", grams: 300 },
  { name: "Морковь", grams: 120 },
  { name: "Лук репчатый", grams: 100 },
];

export default function ScaleForm() {
  // Пример-заготовка, чтобы страница не открывалась пустой. Сверяемся со
  // справочником: если позицию переименуют, она молча выпадет, а не
  // превратится в строку с нулевым КБЖУ.
  const [items, setItems] = useState<RecipeItem[]>(() => STARTER.filter((item) => findFood(item.name)));
  const [fromPortions, setFrom] = useState(4);
  const [toPortions, setTo] = useState(6);
  const [query, setQuery] = useState("");

  const found = searchFoods(query);
  const result = scaleRecipe(items, fromPortions, toPortions);

  const add = (name: string) => {
    setQuery("");
    if (items.some((item) => item.name === name)) return;
    setItems([...items, { name, grams: 100 }]);
  };

  return <div className="raschet-form" role="group" aria-label="Пересчёт рецепта на другое число порций">
    <fieldset>
      <legend>Сколько порций было и сколько нужно</legend>
      <div className="raschet-fields">
        <label>
          Рецепт написан на
          <input type="number" inputMode="numeric" min={1} max={50} value={fromPortions}
            onChange={(e) => setFrom(clamp(e.target.value, 4))} />
        </label>
        <label>
          Готовите на
          <input type="number" inputMode="numeric" min={1} max={50} value={toPortions}
            onChange={(e) => setTo(clamp(e.target.value, 6))} />
        </label>
      </div>
      <p className="raschet-hint">
        Коэффициент пересчёта — <b>×{ru(result.factor, 2)}</b>. На него умножается каждый ингредиент,
        кроме приправ: о них ниже.
      </p>
    </fieldset>

    <fieldset>
      <legend>Ингредиенты исходного рецепта</legend>
      <ul className="recipe-items">
        {items.length === 0 && <li className="recipe-empty">Пока пусто — добавьте ингредиенты ниже</li>}
        {items.map((item, index) => <li key={item.name}>
          <span className="recipe-item-name">{item.name}</span>
          <span className="recipe-item-grams">
            <input type="number" inputMode="numeric" min={0} max={10000} value={item.grams}
              aria-label={`${item.name}, граммов`}
              onChange={(e) => {
                const next = [...items];
                next[index] = { ...item, grams: Math.min(10000, Math.max(0, Math.round(Number(e.target.value) || 0))) };
                setItems(next);
              }} />
            <i>г</i>
          </span>
          <button type="button" className="recipe-remove" aria-label={`Убрать ${item.name}`}
            onClick={() => setItems(items.filter((_, i) => i !== index))}>×</button>
        </li>)}
      </ul>

      <div className="recipe-search">
        <label className="field">
          Добавить ингредиент
          <input type="search" value={query} placeholder="Начните вводить название"
            onChange={(e) => setQuery(e.target.value)} />
        </label>
        {found.length > 0 && <ul className="recipe-results">
          {found.map((food) => <li key={food.name}>
            <button type="button" onClick={() => add(food.name)}>
              {food.name} <i>{food.kcal} ккал / 100 г</i>
            </button>
          </li>)}
        </ul>}
      </div>
    </fieldset>

    <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">×{ru(result.factor, 2)} <span>новая закладка на {toPortions} {plural(toPortions)}</span></p>

        <div className="raschet-table-scroll">
          <table className="raschet-table">
            <thead>
              <tr><th>Ингредиент</th><th>Было</th><th>Стало</th><th>Разница</th></tr>
            </thead>
            <tbody>
              {result.items.map((item) => <tr key={item.name}>
                <td>{item.name}</td>
                <td>{item.from} г</td>
                <td><strong>{item.to} г</strong></td>
                <td>{item.delta > 0 ? `+${item.delta}` : item.delta} г</td>
              </tr>)}
              {result.items.length === 0 && <tr><td colSpan={4}>Добавьте ингредиенты, чтобы увидеть пересчёт</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="raschet-submetrics">
          <div><strong>{result.rawWeightTo} г</strong><span>Сырой вес закладки</span></div>
          <div><strong>{result.perPortion.kcal} ккал</strong><span>В одной порции</span></div>
          <div><strong>{ru(result.perPortion.protein)} / {ru(result.perPortion.fat)} / {ru(result.perPortion.carbs)}</strong><span>Б/Ж/У порции, г</span></div>
        </div>

        <p className="raschet-adjusted">
          <strong>Калорийность порции при пересчёте не меняется</strong> — она была и остаётся{" "}
          {result.perPortion.kcal} ккал. Меняется закладка и объём кастрюли, а не то, что окажется
          в тарелке. Это самое частое опасение при увеличении рецепта, и оно напрасно.
        </p>

        <div className="raschet-caveats">
          <p>
            Прикиньте посуду заранее: {result.rawWeightTo} г сырых продуктов — это примерно{" "}
            {ru(Math.max(1, (result.rawWeightTo / 1000) * 1.3))} л объёма с запасом
            на кипение. Полуторная закладка в ту же кастрюлю обычно влезает, двойная — почти никогда.
          </p>
        </div>
      </div>
    </div>
  </div>;
}

function clamp(raw: string, fallback: number): number {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(50, value);
}

function plural(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "порцию";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "порции";
  return "порций";
}
