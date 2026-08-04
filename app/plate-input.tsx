"use client";

// Тарелка вместо чисел — экран упрощённого учёта.
//
// Одна разметка на веб и Mini App: запись получается одинаковая, и разводить
// её по двум компонентам значило бы гарантированно их развести. Цвета и
// шрифты берутся из переменных, поэтому внутри .tg-root экран сам собой
// оказывается в теме Telegram.
//
// Почему тут нет ни одного числа. В этом весь смысл режима: приверженность
// упрощённому учёту 97% против 49% при той же потере веса на шести месяцах
// (docs/research-2026-08.md, 7.4), и второй довод — стыд при записи «плохой»
// еды, которого нет там, где нечего сравнивать с бюджетом. Диапазон энергии
// показывается только после выбора и только диапазоном.

import { useState } from "react";
import {
  buildSimpleMeal,
  PLATE_PARTS,
  PORTION_LABELS,
  simpleKcalRange,
  type PlatePart,
  type PortionSize,
  type SimpleMealItem,
} from "@/lib/simple-log";

const PORTIONS: PortionSize[] = ["less", "usual", "more"];

export function PlateInput({
  showCalories,
  busy,
  onSave,
}: {
  showCalories: boolean;
  busy?: boolean;
  onSave: (items: SimpleMealItem[]) => void;
}) {
  const [parts, setParts] = useState<PlatePart[]>([]);
  const [portion, setPortion] = useState<PortionSize>("usual");

  const items = buildSimpleMeal({ parts, portion });
  const range = simpleKcalRange(items);

  function toggle(key: PlatePart) {
    setParts((current) => (current.includes(key) ? current.filter((p) => p !== key) : [...current, key]));
  }

  return <section className="plate">
    <p className="plate-question">Что было на тарелке?</p>
    <div className="plate-parts">
      {PLATE_PARTS.map((part) => {
        const active = parts.includes(part.key);
        return <button
          key={part.key}
          type="button"
          className={active ? "plate-part plate-part--on" : "plate-part"}
          aria-pressed={active}
          onClick={() => toggle(part.key)}
        >
          <b>{part.label}</b>
          <span>{part.hint}</span>
        </button>;
      })}
    </div>

    <p className="plate-question">Сколько её было?</p>
    <div className="plate-portions">
      {PORTIONS.map((key) => <button
        key={key}
        type="button"
        className={portion === key ? "plate-portion plate-portion--on" : "plate-portion"}
        aria-pressed={portion === key}
        onClick={() => setPortion(key)}
      >
        {PORTION_LABELS[key]}
      </button>)}
    </div>

    {/* Диапазон, а не число: человек не называл ни продукта, ни веса, и
        точная цифра здесь была бы обещанием, которого мы не выполним. */}
    {showCalories && items.length > 0 &&
      <p className="plate-range">Примерно {range.min}–{range.max} ккал</p>}

    <button className="plate-save" type="button" disabled={busy || items.length === 0} onClick={() => onSave(items)}>
      {busy ? "Сохраняем…" : "Записать"}
    </button>
    {items.length === 0 && <p className="plate-note">Отметьте хотя бы одну часть тарелки.</p>}
  </section>;
}
