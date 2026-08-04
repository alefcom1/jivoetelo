"use client";

// Норма воды. Считаем всю воду и отдельно ту, что нужно выпить: разница —
// вода из еды, и без неё человек добирает лишнее и удивляется, что «не
// лезет». Это же и главное отличие от формулы «30 мл на кг», которой
// заполнена вся выдача.

import { useState } from "react";
import { GLASS_ML, computeWater } from "@/lib/water";

export default function WaterForm() {
  const [sex, setSex] = useState<"female" | "male">("female");
  const [weight, setWeight] = useState(65);
  const [activeHours, setActiveHours] = useState(0);
  const [hot, setHot] = useState(false);

  const result = computeWater({ sex, weightKg: weight, activeHours, hot });
  const naive = Math.round(weight * 30);

  return <div className="raschet-form" role="group" aria-label="Расчёт нормы воды">
    <fieldset>
      <legend>Пол</legend>
      <div className="raschet-choice">
        {(["female", "male"] as const).map((key) => <button key={key} type="button"
          className={sex === key ? "active" : ""} onClick={() => setSex(key)}>
          {key === "female" ? "Женский" : "Мужской"}
        </button>)}
      </div>
    </fieldset>

    <div className="raschet-fields">
      <label>Вес, кг<input type="number" inputMode="decimal" min={35} max={250} value={weight}
        onChange={(e) => setWeight(Math.min(250, Math.max(35, Math.round(Number(e.target.value) || 0))))} /></label>
      <label>Часов нагрузки сегодня<input type="number" inputMode="decimal" min={0} max={8} step={0.5} value={activeHours}
        onChange={(e) => setActiveHours(Math.min(8, Math.max(0, Number(e.target.value) || 0)))} /></label>
    </div>

    <label className="raschet-check">
      <input type="checkbox" checked={hot} onChange={(e) => setHot(e.target.checked)} />
      <span>Жарко: улица выше 25° или душное помещение</span>
    </label>

    <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">
          {(result.drinkMl / 1000).toFixed(1).replace(".", ",")} <span>литра выпить за день</span>
        </p>

        <div className="water-glasses" aria-hidden>
          {Array.from({ length: Math.min(14, result.glasses) }, (_, i) => <span key={i} className="water-glass" />)}
        </div>
        <p className="raschet-hint">
          Это примерно {result.glasses} стаканов по {GLASS_ML} мл — считая любые напитки: воду, чай,
          кофе, компот, суп.
        </p>

        <div className="raschet-submetrics">
          <div><strong>{result.totalMl} мл</strong><span>Вся вода за сутки</span></div>
          <div><strong>{result.fromFoodMl} мл</strong><span>Придёт с едой</span></div>
          <div><strong>{result.drinkMl} мл</strong><span>Выпить напитками</span></div>
          {result.extraMl > 0 && <div><strong>+{result.extraMl} мл</strong><span>За нагрузку и жару</span></div>}
        </div>

        <p className="raschet-adjusted">
          Популярная формула «30 мл на килограмм» дала бы вам {naive} мл — и это была бы норма
          <em> всей</em> воды, которую обычно предлагают выпить напитками сверх еды.
          {naive > result.drinkMl
            ? " То есть примерно на четверть больше, чем нужно."
            : " В вашем случае разница невелика, но метод от этого не становится обоснованным."}
        </p>
      </div>
    </div>
  </div>;
}
