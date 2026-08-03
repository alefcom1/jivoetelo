"use client";

// Ответ на порцию, а не на сто грамм.
//
// Это и есть главное отличие каталога от чужих таблиц. Все шесть заметных
// русскоязычных справочников отвечают «110 ккал на 100 г» — и человек,
// стоящий перед своей тарелкой, дальше множит в уме на непонятно что, потому
// что не знает, сколько в ней грамм. Сто грамм на странице остаются, но
// строчкой в составе, а не ответом.
//
// Бытовые меры здесь по той же причине: весов у человека обычно нет, а
// столовая ложка и стакан есть у всех.

import { useState } from "react";
import type { HouseholdMeasure } from "@/lib/products";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function PortionPicker({
  name,
  kcal,
  protein,
  fat,
  carbs,
  fiber,
  portionG,
  household,
}: {
  name: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  portionG: number;
  household: HouseholdMeasure[];
}) {
  const [grams, setGrams] = useState(portionG);

  const share = grams / 100;

  return <section className="portion-picker">
    <div className="portion-answer">
      <strong>{Math.round(kcal * share)}</strong>
      <span>ккал в {grams} г</span>
    </div>

    <label className="portion-slider">
      <span className="sr-only">Вес порции, граммы</span>
      {/* Ползунок и поле рядом: пальцем удобнее тянуть, а когда вес известен
          точно (взвесили), быстрее набрать. */}
      <input
        type="range"
        min={10}
        max={500}
        step={5}
        value={Math.min(500, grams)}
        onChange={(e) => setGrams(Number(e.target.value))}
        aria-label="Вес порции ползунком"
      />
      <input
        type="number"
        min={1}
        max={3000}
        value={grams}
        onChange={(e) => {
          const next = Number(e.target.value);
          setGrams(Number.isFinite(next) && next > 0 ? Math.min(3000, Math.round(next)) : 1);
        }}
        aria-label="Вес порции в граммах"
      />
      <span className="portion-unit">г</span>
    </label>

    {household.length > 0 && <div className="portion-measures">
      {/* Обычная порция первой: с неё страница и открывается. */}
      <button type="button" onClick={() => setGrams(portionG)}>
        обычная порция<i>{portionG} г</i>
      </button>
      {household.map((measure) => <button key={measure.label} type="button" onClick={() => setGrams(measure.grams)}>
        {measure.label}<i>{measure.grams} г</i>
      </button>)}
      <button type="button" onClick={() => setGrams(100)}>
        100 г<i>как в таблицах</i>
      </button>
    </div>}

    <dl className="portion-macros">
      <div><dt>Белки</dt><dd>{round1(protein * share)} г</dd></div>
      <div><dt>Жиры</dt><dd>{round1(fat * share)} г</dd></div>
      <div><dt>Углеводы</dt><dd>{round1(carbs * share)} г</dd></div>
      <div><dt>Клетчатка</dt><dd>{round1(fiber * share)} г</dd></div>
    </dl>

    <p className="field-note">
      {name}: {kcal} ккал на 100 г. Двигайте ползунок или выберите меру — цифра пересчитается.
    </p>
  </section>;
}
