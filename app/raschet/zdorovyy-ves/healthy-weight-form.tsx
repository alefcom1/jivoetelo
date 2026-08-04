"use client";

// Здоровый вес вместо «идеального». Приём страницы — показать все четыре
// классические формулы разом: они дают четыре разных числа, и это самый
// наглядный аргумент против самой идеи одного идеального веса. Рядом —
// диапазон нормального ИМТ, который честнее любой из них.

import { useState } from "react";
import { healthyWeight } from "@/lib/body-composition";
import { ru } from "../format";

export default function HealthyWeightForm() {
  const [sex, setSex] = useState<"female" | "male">("female");
  const [heightCm, setHeight] = useState(168);
  const [weightKg, setWeight] = useState(0);

  const result = healthyWeight(sex, heightCm);
  if (!result) return null;

  const { bmiRange, formulaRange, formulas, formulaSpread } = result;
  const inRange = weightKg > 0 && weightKg >= bmiRange.from && weightKg <= bmiRange.to;
  const span = Math.max(1, bmiRange.to - bmiRange.from);

  return <div className="raschet-form" role="group" aria-label="Расчёт здорового диапазона веса">
    <fieldset>
      <legend>Пол</legend>
      <div className="raschet-choice">
        {(["female", "male"] as const).map((key) => <button key={key} type="button"
          className={sex === key ? "active" : ""} onClick={() => setSex(key)}
          aria-pressed={sex === key}>
          {key === "female" ? "Женщина" : "Мужчина"}
        </button>)}
      </div>
      <p className="raschet-hint">
        Пол нужен только формулам «идеального веса» — диапазон нормального ИМТ от него не зависит
        вовсе. Уже одно это говорит о том, насколько разные это подходы.
      </p>
    </fieldset>

    <div className="raschet-fields">
      <label>
        Рост, см
        <input type="number" inputMode="numeric" min={130} max={220} value={heightCm}
          onChange={(e) => setHeight(Math.min(220, Math.max(130, Math.round(Number(e.target.value) || 168))))} />
      </label>
      <label>
        Текущий вес, кг <i className="field-optional">не обязательно</i>
        <input type="number" inputMode="decimal" min={0} max={250} value={weightKg || ""}
          placeholder="—"
          onChange={(e) => setWeight(Math.min(250, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)))} />
      </label>
    </div>

    <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">{bmiRange.from}–{bmiRange.to} кг <span>здоровый диапазон при росте {heightCm} см</span></p>

        <div className="weight-scale">
          <div className="weight-scale-bar">
            <span className="weight-scale-healthy" />
            {weightKg > 0 && <span className="weight-scale-marker" style={{
              left: `${Math.min(100, Math.max(0, ((weightKg - bmiRange.from) / span) * 100))}%`,
            }} aria-hidden />}
          </div>
          <p className="weight-scale-legend">
            <span>{bmiRange.from} кг</span>
            <span>ИМТ 18,5–24,9</span>
            <span>{bmiRange.to} кг</span>
          </p>
        </div>

        <div className="raschet-submetrics">
          <div><strong>{bmiRange.to - bmiRange.from} кг</strong><span>Ширина диапазона</span></div>
          <div><strong>{ru(formulaRange.from)}–{ru(formulaRange.to)} кг</strong><span>Что дают формулы</span></div>
          <div><strong>{ru(formulaSpread)} кг</strong><span>Расхождение между ними</span></div>
        </div>

        <p className="raschet-adjusted">
          {weightKg > 0
            ? inRange
              ? `Ваш вес внутри здорового диапазона. Внутри него нет «более правильной» точки: ${bmiRange.from} и ${bmiRange.to} кг одинаково нормальны.`
              : weightKg < bmiRange.from
                ? `Ваш вес ниже диапазона на ${ru(bmiRange.from - weightKg)} кг. Недостаток массы — не безобидная сторона шкалы, и с ним стоит показаться врачу.`
                : `До верхней границы диапазона ${ru(weightKg - bmiRange.to)} кг. Это ориентир, а не срок: заметная часть пользы для здоровья появляется уже при снижении на 5% веса.`
            : "Введите текущий вес, если хотите увидеть, где вы относительно диапазона. Это не обязательно — сам диапазон зависит только от роста."}
        </p>
      </div>
    </div>

    <fieldset>
      <legend>Четыре формулы «идеального веса» — четыре разных ответа</legend>
      <p className="raschet-hint">
        Все четыре придуманы для клинических задач, в основном для расчёта доз лекарств, и ни одна
        не создавалась как цель для человека. Разброс между ними — {ru(formulaSpread)} кг.
      </p>
      <div className="raschet-table-scroll">
        <table className="raschet-table">
          <thead>
            <tr><th>Формула</th><th>Результат</th><th>Что это такое</th></tr>
          </thead>
          <tbody>
            {formulas.map((formula) => <tr key={formula.name}>
              <td>{formula.name}</td>
              <td>{ru(formula.weightKg)} кг</td>
              <td>{formula.note}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="raschet-caveats">
        <p>
          Все четыре считаются от роста сверх 152,4 см — наследие имперской системы. Ниже этой
          границы прибавка обнуляется, и формула перестаёт реагировать на рост вовсе: при 140 см
          она выдаст тот же результат, что при 152, и он окажется выше верхней границы здорового
          ИМТ. Это не наша придирка, а свойство самих формул.
        </p>
      </div>
    </fieldset>
  </div>;
}
