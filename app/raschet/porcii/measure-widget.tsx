"use client";

// Порция без весов: выбираете продукт — считаете ложками, стаканами и
// штуками. Счётчики вместо одного поля «сколько ложек»: набор «2 ложки
// творога и стакан кефира» человек держит в голове именно так, штуками.

import { useState } from "react";
import { PRODUCTS, kcalFor, type Product } from "@/lib/products";

type Counts = Record<string, number>;

export function MeasureWidget() {
  const [slug, setSlug] = useState(PRODUCTS[0]?.slug ?? "");
  const [counts, setCounts] = useState<Counts>({});

  const product: Product | undefined = PRODUCTS.find((candidate) => candidate.slug === slug);
  if (!product) return null;

  // Обычная порция — тоже мера: с неё чаще всего и начинают.
  const measures = [
    { label: "обычная порция", grams: product.portionG },
    ...product.household.filter((measure) => measure.label !== "обычная порция"),
  ];

  const totalGrams = measures.reduce((sum, measure) => sum + (counts[measure.label] ?? 0) * measure.grams, 0);
  const totalKcal = kcalFor(product, totalGrams);
  const totalProtein = Math.round(((product.protein * totalGrams) / 100) * 10) / 10;

  function bump(label: string, delta: number) {
    setCounts((current) => {
      const next = Math.max(0, (current[label] ?? 0) + delta);
      return { ...current, [label]: next };
    });
  }

  return <div className="converter" role="group" aria-label="Подсчёт порции бытовыми мерами">
    <label className="field">
      Продукт
      <select value={product.slug} onChange={(e) => { setSlug(e.target.value); setCounts({}); }}>
        {PRODUCTS.map((candidate) => <option key={candidate.slug} value={candidate.slug}>{candidate.name}</option>)}
      </select>
    </label>

    <ul className="measure-list">
      {measures.map((measure) => <li key={measure.label}>
        <span className="measure-name">
          {measure.label}
          <i>{measure.grams} г · {kcalFor(product, measure.grams)} ккал</i>
        </span>
        <span className="measure-stepper">
          <button type="button" aria-label={`Убрать: ${measure.label}`} onClick={() => bump(measure.label, -1)}>−</button>
          <b>{counts[measure.label] ?? 0}</b>
          <button type="button" aria-label={`Добавить: ${measure.label}`} onClick={() => bump(measure.label, 1)}>+</button>
        </span>
      </li>)}
    </ul>

    {totalGrams > 0
      ? <p className="converter-answer">
          Итого <b>{totalGrams} г</b> — примерно <b>{totalKcal} ккал</b> и <b>{totalProtein} г</b> белка.
        </p>
      : <p className="field-note">Нажимайте «+» у мер — итог посчитается сам.</p>}
  </div>;
}
