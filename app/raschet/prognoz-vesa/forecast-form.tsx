"use client";

// Прогноз веса при заданном рационе. Главное здесь — показать затухание:
// наивная формула «7700 ккал на килограмм» обещает бесконечное снижение, и
// когда через четыре месяца вес встаёт, человек считает это провалом.
// График рисует обе линии — нашу и наивную, — чтобы разница была видна, а
// не описана словами.

import { useState } from "react";
import { KCAL_PER_KG, forecastWeight } from "@/lib/forecast";
import { computeTdee, type Activity } from "@/lib/targets";

const ACTIVITIES: Array<{ key: Activity; label: string }> = [
  { key: "sedentary", label: "Сидячий" },
  { key: "light", label: "Лёгкая" },
  { key: "moderate", label: "Умеренная" },
  { key: "high", label: "Высокая" },
];

export default function ForecastForm() {
  const [sex, setSex] = useState<"female" | "male">("female");
  const [age, setAge] = useState(35);
  const [height, setHeight] = useState(170);
  const [weight, setWeight] = useState(85);
  const [activity, setActivity] = useState<Activity>("light");
  const [intake, setIntake] = useState(1700);
  const months = 12;

  const tdee = Math.round(computeTdee(
    { sexForFormula: sex, birthYear: 2026 - age, heightCm: height, weightKg: weight, activity },
    2026,
  ));
  const result = forecastWeight({ startWeightKg: weight, startTdeeKcal: tdee, intakeKcal: intake, months });

  // Наивная линия для сравнения: постоянный дефицит, никакого затухания.
  const naive = Array.from({ length: months + 1 }, (_, m) =>
    weight - ((tdee - intake) * 30.4 * m) / KCAL_PER_KG);

  const all = [...result.points.map((p) => p.weightKg), ...naive];
  const min = Math.min(...all) - 2;
  const max = Math.max(...all) + 2;
  const x = (m: number) => 60 + (m / months) * 660;
  const y = (kg: number) => 30 + ((max - kg) / (max - min)) * 190;

  const line = (values: number[]) =>
    values.map((v, m) => `${m ? "L" : "M"}${x(m).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  return <div className="raschet-form" role="group" aria-label="Прогноз веса">
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
      <label>Возраст<input type="number" inputMode="numeric" min={14} max={100} value={age}
        onChange={(e) => setAge(num(e.target.value, 14, 100, 35))} /></label>
      <label>Рост, см<input type="number" inputMode="numeric" min={120} max={230} value={height}
        onChange={(e) => setHeight(num(e.target.value, 120, 230, 170))} /></label>
      <label>Вес сейчас, кг<input type="number" inputMode="decimal" min={35} max={250} value={weight}
        onChange={(e) => setWeight(num(e.target.value, 35, 250, 85))} /></label>
      <label>Сколько едите, ккал<input type="number" inputMode="numeric" min={800} max={5000} step={50} value={intake}
        onChange={(e) => setIntake(num(e.target.value, 800, 5000, 1700))} /></label>
    </div>

    <fieldset>
      <legend>Активность</legend>
      <div className="raschet-choice">
        {ACTIVITIES.map((item) => <button key={item.key} type="button"
          className={activity === item.key ? "active" : ""} onClick={() => setActivity(item.key)}>
          {item.label}
        </button>)}
      </div>
    </fieldset>

    <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">
          {result.finalWeightKg.toFixed(1).replace(".", ",")} <span>кг через год</span>
        </p>

        <figure className="forecast-chart">
          <svg viewBox="0 0 760 260" role="img"
            aria-label={`Прогноз: с ${weight} кг до ${result.finalWeightKg} кг за год, со снижением темпа`}>
            <rect width="760" height="260" fill="#fffefa" />
            {[0, 3, 6, 9, 12].map((m) => <g key={m}>
              <line x1={x(m)} y1="22" x2={x(m)} y2="228" stroke="#d7d4ca" strokeWidth="1" />
              <text x={x(m)} y="248" fontSize="13" fill="#75766f" textAnchor="middle">
                {m === 0 ? "сейчас" : `${m} мес`}
              </text>
            </g>)}
            <path d={line(naive)} fill="none" stroke="#d7d4ca" strokeWidth="4" strokeDasharray="8 6" />
            <path d={line(result.points.map((p) => p.weightKg))} fill="none" stroke="#e56d55" strokeWidth="5" strokeLinecap="round" />
            <text x="60" y="18" fontSize="13" fill="#75766f">кг</text>
            <text x={x(0) - 6} y={y(weight) - 10} fontSize="14" fill="#171917" fontWeight="700">{weight}</text>
            <text x={x(months) - 4} y={y(result.finalWeightKg) - 12} fontSize="14" fill="#e56d55" fontWeight="700" textAnchor="end">
              {result.finalWeightKg.toFixed(1).replace(".", ",")}
            </text>
          </svg>
          <figcaption>
            Коралловая линия — наш прогноз с учётом того, что расход падает вместе с весом. Пунктир —
            наивный расчёт «7700 ккал на килограмм», который обещает вечное снижение.
          </figcaption>
        </figure>

        <div className="raschet-submetrics">
          <div><strong>{result.totalChangeKg > 0 ? "+" : ""}{result.totalChangeKg.toFixed(1).replace(".", ",")} кг</strong><span>Изменение за год</span></div>
          <div><strong>{tdee} ккал</strong><span>Расход сейчас</span></div>
          <div><strong>{result.points[0].deficitKcal > 0 ? "−" : "+"}{Math.abs(result.points[0].deficitKcal)} ккал</strong><span>Дефицит в начале</span></div>
          <div><strong>{result.equilibriumKg.toFixed(1).replace(".", ",")} кг</strong><span>Вес, на котором всё остановится</span></div>
        </div>

        {result.plateauMonth !== null && <p className="raschet-adjusted">
          Примерно с {result.plateauMonth}-го месяца изменения станут меньше полукилограмма в месяц —
          и это не «сломался обмен веществ», а обычная арифметика: тело стало легче и тратит меньше.
          Чтобы движение продолжилось, придётся либо ещё уменьшить рацион, либо увеличить активность,
          либо признать текущий вес достаточным.
        </p>}

        <p className="raschet-hint">
          Прогноз — модель, а не обещание. Он не знает про воду, цикл, соль и то, что реальный рацион
          редко бывает одинаковым каждый день. Ошибка в первый месяц невелика, к году может достигать
          пары килограммов.
        </p>
      </div>
    </div>
  </div>;
}

function num(value: string, min: number, max: number, fallback: number): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
