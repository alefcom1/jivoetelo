"use client";

// Пересчёт сухое ↔ варёное. Виджет над статьёй: считает в обе стороны,
// потому что вопрос задают с обеих — «сколько получится из 100 г сухой» и
// «сколько сухой было в 300 г готовой».
//
// Направление задаётся не переключателем, а тем, в какое поле человек ввёл
// число: два синхронных поля понятнее любого тумблера, и оба ответа всегда
// на экране.

import { useState } from "react";
import { PRODUCTS, type Product } from "@/lib/products";

const CONVERTIBLE: Product[] = PRODUCTS.filter((product) => product.raw);

function round(value: number): number {
  return Math.round(value);
}

export function DryCookedConverter() {
  const [slug, setSlug] = useState(CONVERTIBLE[0]?.slug ?? "");
  const [dryGrams, setDryGrams] = useState(100);

  const product = CONVERTIBLE.find((candidate) => candidate.slug === slug) ?? CONVERTIBLE[0];
  if (!product?.raw) return null;

  const cookedGrams = round(dryGrams * product.raw.ratio);
  const kcal = round((dryGrams * product.raw.kcal) / 100);

  function setFromCooked(cooked: number) {
    setDryGrams(Math.max(0, Math.round(cooked / product!.raw!.ratio)));
  }

  return <div className="converter" role="group" aria-label="Пересчёт сухого продукта в готовый">
    <label className="field">
      Продукт
      <select value={product.slug} onChange={(e) => setSlug(e.target.value)}>
        {CONVERTIBLE.map((candidate) => <option key={candidate.slug} value={candidate.slug}>
          {candidate.name.replace(" отварной", "").replace(" отварная", "").replace(" на воде", "")}
        </option>)}
      </select>
    </label>

    <div className="converter-row">
      <label className="field">
        Сухой, г
        <input
          type="number" inputMode="numeric" min={0} max={2000}
          value={dryGrams}
          onChange={(e) => setDryGrams(Math.max(0, Math.min(2000, Math.round(Number(e.target.value) || 0))))}
        />
      </label>
      <span className="converter-arrows" aria-hidden>⇄</span>
      <label className="field">
        Готовой, г
        <input
          type="number" inputMode="numeric" min={0} max={6000}
          value={cookedGrams}
          onChange={(e) => setFromCooked(Math.max(0, Math.min(6000, Math.round(Number(e.target.value) || 0))))}
        />
      </label>
    </div>

    <p className="converter-answer">
      <b>{dryGrams} г</b> сухой — это примерно <b>{cookedGrams} г</b> готовой и <b>{kcal} ккал</b>{" "}
      в обоих случаях: вода добавляет вес, но не энергию.
    </p>
    <p className="field-note">
      На 100 г: сухая — {product.raw.kcal} ккал, готовая — {product.kcal} ккал. Коэффициент
      разваривания ≈{product.raw.ratio} — зависит от сорта и количества воды, поэтому «примерно».
    </p>
  </div>;
}
