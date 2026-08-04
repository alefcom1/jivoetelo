"use client";

// Калькулятор ИМТ с отношением талии к росту.
//
// Талия — не «дополнительное поле», а вторая половина ответа: она стоит
// в той же форме и считается сразу, потому что человек, пришедший за ИМТ,
// сам не знает, что WHtR ему полезнее. Спрашивать разрешения показать
// более информативный показатель — странная вежливость.

import { useState } from "react";
import {
  BMI_LABELS,
  WAIST_LABELS,
  bmiCaveats,
  computeBmi,
  computeWaistRatio,
  waistTargetCm,
} from "@/lib/bmi";

const SCALE: Array<{ from: number; to: number; label: string; key: string }> = [
  { from: 0, to: 18.5, label: "Дефицит", key: "under" },
  { from: 18.5, to: 25, label: "Норма", key: "normal" },
  { from: 25, to: 30, label: "Избыток", key: "over" },
  { from: 30, to: 40, label: "Ожирение", key: "obese" },
];

export default function BmiForm() {
  const [height, setHeight] = useState(170);
  const [weight, setWeight] = useState(70);
  const [waist, setWaist] = useState<number | "">("");
  const [age, setAge] = useState<number | "">("");
  const [athlete, setAthlete] = useState(false);

  const bmi = computeBmi(weight, height);
  const waistResult = typeof waist === "number" && waist > 0 ? computeWaistRatio(waist, height) : null;
  const caveats = bmiCaveats({
    age: typeof age === "number" ? age : undefined,
    athlete,
  });

  // Положение метки на шкале: 15 слева, 40 справа — за этими границами
  // двигать нечего, а растягивать шкалу до 60 значит сплющить середину,
  // где находится почти вся выборка.
  const markerPercent = bmi ? Math.min(100, Math.max(0, ((bmi.bmi - 15) / 25) * 100)) : 0;

  return <div className="raschet-form" role="group" aria-label="Расчёт индекса массы тела">
    <div className="raschet-fields">
      <label>
        Рост, см
        <input type="number" inputMode="numeric" min={100} max={250} value={height}
          onChange={(e) => setHeight(clamp(Number(e.target.value), 100, 250))} />
      </label>
      <label>
        Вес, кг
        <input type="number" inputMode="decimal" min={30} max={300} value={weight}
          onChange={(e) => setWeight(clamp(Number(e.target.value), 30, 300))} />
      </label>
      <label>
        Талия, см <i className="field-optional">не обязательно</i>
        <input type="number" inputMode="numeric" min={40} max={200} value={waist}
          placeholder="—"
          onChange={(e) => setWaist(e.target.value === "" ? "" : clamp(Number(e.target.value), 40, 200))} />
      </label>
      <label>
        Возраст <i className="field-optional">не обязательно</i>
        <input type="number" inputMode="numeric" min={10} max={110} value={age}
          placeholder="—"
          onChange={(e) => setAge(e.target.value === "" ? "" : clamp(Number(e.target.value), 10, 110))} />
      </label>
    </div>

    <label className="raschet-check">
      <input type="checkbox" checked={athlete} onChange={(e) => setAthlete(e.target.checked)} />
      <span>Регулярно тренируюсь с весами, мышечная масса заметная</span>
    </label>

    {bmi && <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">{bmi.bmi.toFixed(1).replace(".", ",")} <span>{BMI_LABELS[bmi.category]}</span></p>

        <div className="bmi-scale" aria-hidden>
          <div className="bmi-scale-bar">
            {SCALE.map((zone) => <span key={zone.key} className={`bmi-zone bmi-zone--${zone.key}`} />)}
          </div>
          <div className="bmi-scale-marker" style={{ left: `${markerPercent}%` }} />
          <div className="bmi-scale-labels">
            {SCALE.map((zone) => <span key={zone.key}>{zone.label}</span>)}
          </div>
        </div>

        <div className="raschet-submetrics">
          <div>
            <strong>{bmi.healthyWeight.from}–{bmi.healthyWeight.to} кг</strong>
            <span>Диапазон нормы для роста {height} см</span>
          </div>
          {waistResult && <div>
            <strong>{waistResult.ratio.toFixed(2).replace(".", ",")}</strong>
            <span>Талия к росту · {WAIST_LABELS[waistResult.zone]}</span>
          </div>}
        </div>

        {waistResult
          ? <p className="raschet-adjusted">
              {waistResult.zone === "low"
                ? `Талия меньше половины роста — по этому признаку риск не повышен. Он информативнее ИМТ, потому что говорит о жире вокруг органов, а не о массе вообще.`
                : `Ориентир — талия меньше половины роста, то есть до ${waistTargetCm(height)} см при вашем росте. Сейчас ${waist} см. Этот признак предсказывает риски лучше, чем сам ИМТ.`}
            </p>
          : <p className="raschet-hint">
              Добавьте обхват талии — и вы получите показатель, который говорит о здоровье больше,
              чем ИМТ. Мерить на уровне пупка, стоя, на выдохе, не втягивая живот.
            </p>}
      </div>

      {caveats.length > 0 && <div className="raschet-caveats">
        {caveats.map((text) => <p key={text.slice(0, 30)}>{text}</p>)}
      </div>}
    </div>}
  </div>;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value * 10) / 10));
}
