"use client";

// Меню на день. Три вещи, которых нет у западных планировщиков и ради
// которых всё затевалось: расхождение с целью названо вслух, ограничения
// действительно применяются, а из состава собирается список покупок.

import { useState } from "react";
import {
  FILTER_LABELS,
  FILTER_NOTES,
  MAX_TARGET,
  MIN_TARGET,
  SLOT_LABELS,
  buildDay,
  shoppingList,
  type MealSlot,
  type MenuFilter,
} from "@/lib/menu";
import { ru } from "../format";

const FILTERS: MenuFilter[] = ["noMeat", "noDairy", "quick", "cheap"];
const DAYS = [1, 3, 7];

export default function MenuForm() {
  const [kcal, setKcal] = useState(1800);
  const [filters, setFilters] = useState<MenuFilter[]>([]);
  const [picks, setPicks] = useState<Partial<Record<MealSlot, number>>>({});
  const [days, setDays] = useState(1);

  const day = buildDay(kcal, filters, picks);
  // Дни недели различаются сдвигом выбора: неделя из семи одинаковых дней —
  // это не меню, а наказание.
  const week = Array.from({ length: days }, (_, index) => buildDay(kcal, filters, shiftPicks(picks, index)));
  const list = shoppingList(week);
  const accurate = Math.abs(day.deviation) <= 5;

  const toggle = (filter: MenuFilter) => {
    setFilters(filters.includes(filter) ? filters.filter((f) => f !== filter) : [...filters, filter]);
    setPicks({});
  };

  return <div className="raschet-form" role="group" aria-label="Меню на день">
    <div className="raschet-fields">
      <label>
        Калорийность, ккал
        <input type="number" inputMode="numeric" min={MIN_TARGET} max={MAX_TARGET} step={50} value={kcal}
          onChange={(e) => setKcal(Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(Number(e.target.value) || 1800))))} />
      </label>
    </div>
    <p className="raschet-hint">
      Не знаете свою норму — посчитайте в <a href="/raschet/energiya">расчёте энергии</a> или
      соберите <a href="/raschet/plan">стартовый коридор целиком</a>. Меню собирается в границах
      от {MIN_TARGET} до {MAX_TARGET} ккал: ниже — зона врачебного наблюдения, выше — задача, которую
      обычными тарелками не решают.
    </p>

    <fieldset>
      <legend>Ограничения</legend>
      <div className="raschet-choice">
        {FILTERS.map((filter) => <button key={filter} type="button"
          className={filters.includes(filter) ? "active" : ""}
          aria-pressed={filters.includes(filter)}
          onClick={() => toggle(filter)}>
          {FILTER_LABELS[filter]}
        </button>)}
      </div>
      {filters.length > 0 && <div className="raschet-caveats">
        {filters.map((filter) => <p key={filter}>{FILTER_NOTES[filter]}</p>)}
      </div>}
    </fieldset>

    <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">{day.total.kcal} <span>ккал в собранном дне</span></p>

        <div className="raschet-submetrics">
          <div><strong>{ru(day.total.protein)} г</strong><span>Белка</span></div>
          <div><strong>{ru(day.total.fat)} г</strong><span>Жира</span></div>
          <div><strong>{ru(day.total.carbs)} г</strong><span>Углеводов</span></div>
          <div><strong>{ru(day.total.fiber)} г</strong><span>Клетчатки</span></div>
        </div>

        <p className={accurate ? "raschet-adjusted" : "raschet-adjusted menu-miss"}>
          {accurate
            ? `Расхождение с целью — ${ru(Math.abs(day.deviation))}%. Это меньше, чем ошибка любых кухонных весов и любой таблицы состава, так что подгонять дальше нечего.`
            : `Набрать ${day.targetKcal} ккал при таких ограничениях не вышло: получилось ${day.total.kcal}, расхождение ${ru(day.deviation)}%. Снимите одно из ограничений или добавьте перекус вручную — мы предпочитаем сказать об этом прямо, а не подогнать цифру.`}
        </p>
      </div>
    </div>

    <ul className="menu-list">
      {day.meals.map((meal, index) => <li key={`${meal.ration.id}-${index}`} className="menu-card">
        <div className="menu-card-top">
          <span className="menu-slot">
            {SLOT_LABELS[meal.slot]}{meal.extra ? " · добавочный" : ""}
          </span>
          <strong>{meal.nutrients.kcal} ккал</strong>
        </div>
        <h3>{meal.ration.title}</h3>
        <ul className="menu-items">
          {meal.items.map((item) => <li key={item.name}>
            <span>{item.name}</span><i>{item.grams} г</i>
          </li>)}
        </ul>
        <p className="menu-card-macros">
          Б {ru(meal.nutrients.protein)} · Ж {ru(meal.nutrients.fat)} · У {ru(meal.nutrients.carbs)} ·
          клетчатка {ru(meal.nutrients.fiber)} г
        </p>
        {!meal.extra && <button type="button" className="link-button menu-reroll"
          onClick={() => setPicks({ ...picks, [meal.slot]: (picks[meal.slot] ?? 0) + 1 })}>
          Заменить {SLOT_LABELS[meal.slot].toLowerCase()} ↻
        </button>}
      </li>)}
    </ul>

    <fieldset>
      <legend>Список покупок</legend>
      <div className="raschet-choice">
        {DAYS.map((count) => <button key={count} type="button"
          className={days === count ? "active" : ""} aria-pressed={days === count}
          onClick={() => setDays(count)}>
          На {count} {count === 1 ? "день" : "дня"}
        </button>)}
      </div>
      <p className="raschet-hint">
        {days === 1
          ? "Продукты этого дня, сложенные по названиям."
          : `Меню на ${days} дня собирается из разных рационов, а продукты складываются. Это то, чего не умеют планировщики, которые тянут готовые блюда: из непрозрачного «блюда» список покупок не соберёшь.`}
      </p>
      <div className="raschet-table-scroll">
        <table className="raschet-table">
          <thead><tr><th>Продукт</th><th>Купить</th></tr></thead>
          <tbody>
            {list.map((row) => <tr key={row.name}>
              <td>{row.name}</td>
              <td>{row.grams < 1000 ? `${row.grams} г` : `${ru(row.grams / 1000)} кг`}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </fieldset>
  </div>;
}

/** Сдвиг выбора рационов для следующего дня недели. */
function shiftPicks(picks: Partial<Record<MealSlot, number>>, shift: number): Partial<Record<MealSlot, number>> {
  if (shift === 0) return picks;
  const next: Partial<Record<MealSlot, number>> = {};
  for (const slot of ["breakfast", "lunch", "snack", "dinner"] as MealSlot[]) {
    // Разный шаг у разных приёмов пищи: с одинаковым сдвигом неделя
    // превращалась в один и тот же набор, просто переставленный.
    const step = slot === "lunch" ? 2 : slot === "dinner" ? 3 : 1;
    next[slot] = (picks[slot] ?? 0) + shift * step;
  }
  return next;
}
