"use client";

// Процент жира по обхватам. Метод ВМС США требует только сантиметровую
// ленту, и в этом всё его достоинство. Погрешность — 3–4 процентных пункта,
// поэтому мы показываем не одну цифру, а диапазон вокруг неё: одна цифра
// здесь создавала бы ложное впечатление измерения.

import { useState } from "react";
import { BODY_FAT_LABELS, computeBodyFat } from "@/lib/body-composition";
import { ru } from "../format";

export default function BodyFatForm() {
  const [sex, setSex] = useState<"female" | "male">("female");
  const [heightCm, setHeight] = useState(168);
  const [neckCm, setNeck] = useState(32);
  const [waistCm, setWaist] = useState(74);
  const [hipCm, setHip] = useState(98);
  const [weightKg, setWeight] = useState(65);

  const result = computeBodyFat({ sex, heightCm, neckCm, waistCm, hipCm }, weightKg);

  return <div className="raschet-form" role="group" aria-label="Расчёт процента жира по обхватам">
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
        Формулы для мужчин и женщин разные: у женщин в расчёт входит обхват бёдер, а доля жира
        при том же сложении физиологически выше.
      </p>
    </fieldset>

    <fieldset>
      <legend>Замеры сантиметровой лентой</legend>
      <div className="raschet-fields">
        <label>
          Рост, см
          <input type="number" inputMode="numeric" min={130} max={220} value={heightCm}
            onChange={(e) => setHeight(clamp(e.target.value, 130, 220, 168))} />
        </label>
        <label>
          Шея, см
          <input type="number" inputMode="numeric" min={20} max={60} value={neckCm}
            onChange={(e) => setNeck(clamp(e.target.value, 20, 60, 32))} />
        </label>
        <label>
          Талия, см
          <input type="number" inputMode="numeric" min={45} max={200} value={waistCm}
            onChange={(e) => setWaist(clamp(e.target.value, 45, 200, 74))} />
        </label>
        {sex === "female" && <label>
          Бёдра, см
          <input type="number" inputMode="numeric" min={60} max={200} value={hipCm}
            onChange={(e) => setHip(clamp(e.target.value, 60, 200, 98))} />
        </label>}
        <label>
          Вес, кг <i className="field-optional">не обязательно</i>
          <input type="number" inputMode="decimal" min={30} max={250} value={weightKg}
            onChange={(e) => setWeight(clamp(e.target.value, 30, 250, 65))} />
        </label>
      </div>
      <p className="raschet-hint">
        Как мерить: шею — под кадыком, лента чуть наклонена вперёд; талию — у мужчин на уровне
        пупка, у женщин в самом узком месте; бёдра — по самой широкой точке. Мерить утром, не
        втягивая живот, лента прилегает, но не сдавливает.
      </p>
    </fieldset>

    <div className="raschet-result">
      <div className="raschet-range-card">
        {result ? <>
          <p className="raschet-range">
            {ru(Math.max(3, result.percent - 3))}–{ru(result.percent + 3)}%
            <span>жира в теле</span>
          </p>
          <div className="raschet-submetrics">
            <div><strong>{ru(result.percent)}%</strong><span>Точечная оценка</span></div>
            <div><strong>{BODY_FAT_LABELS[result.category]}</strong><span>Категория</span></div>
            {result.fatMassKg !== undefined && <div>
              <strong>{ru(result.fatMassKg)} кг</strong><span>Масса жира</span>
            </div>}
            {result.leanMassKg !== undefined && <div>
              <strong>{ru(result.leanMassKg)} кг</strong><span>Безжировая масса</span>
            </div>}
          </div>
          <p className="raschet-adjusted">
            Диапазон, а не одна цифра: погрешность метода — около трёх процентных пунктов, а у
            людей с нетипичным телосложением больше. Для отслеживания динамики этого достаточно,
            для «точного числа» — нет.
          </p>
          <div className="raschet-caveats">
            <p>
              Считайте по одному и тому же способу и в одно и то же время суток. Ценность метода
              не в абсолютной цифре, а в том, что при неизменном весе он покажет, если талия
              уходит: это как раз тот случай, когда весы молчат, а состав тела меняется.
            </p>
          </div>
        </> : <>
          <p className="raschet-range">—</p>
          <p className="raschet-adjusted">
            С такими замерами формула не работает: обхват талии должен быть больше обхвата шеи, а
            женщине нужен ещё и обхват бёдер. Проверьте, что все значения введены.
          </p>
        </>}
      </div>
    </div>
  </div>;
}

function clamp(raw: string, min: number, max: number, fallback: number): number {
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value) || value === 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(value * 10) / 10));
}
