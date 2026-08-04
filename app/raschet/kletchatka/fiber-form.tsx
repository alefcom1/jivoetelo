"use client";

// Норма клетчатки и — главное — чем её закрыть. Таблица источников
// строится из нашего справочника: это то, чего нет у калькуляторов,
// которые просто умножают вес на коэффициент.

import { useState } from "react";
import { fiberTarget, topFiberSources } from "@/lib/fiber";

export default function FiberForm() {
  const [kcal, setKcal] = useState(2000);
  const target = fiberTarget(kcal);
  const sources = topFiberSources(target.target, 14);

  return <>
    <div className="raschet-form" role="group" aria-label="Расчёт нормы клетчатки">
      <div className="raschet-fields">
        <label>
          Калорийность рациона, ккал
          <input type="number" inputMode="numeric" min={1000} max={5000} step={50} value={kcal}
            onChange={(e) => setKcal(Math.min(5000, Math.max(1000, Math.round(Number(e.target.value) || 2000))))} />
        </label>
      </div>
      <p className="raschet-hint">
        Не знаете свою калорийность — оставьте 2000, это близко к среднему.
        Точную цифру даёт <a href="/raschet/energiya">расчёт нормы энергии</a>.
      </p>

      <div className="raschet-result">
        <div className="raschet-range-card">
          <p className="raschet-range">{target.target} <span>граммов клетчатки в день</span></p>
          <div className="raschet-submetrics">
            <div><strong>{target.range.from}–{target.range.to} г</strong><span>Разумный диапазон</span></div>
            <div><strong>14 г</strong><span>На каждую 1000 ккал</span></div>
          </div>
          <p className="raschet-adjusted">
            Российские методические рекомендации МР 2.3.1.0253-21 дают взрослому 20 г пищевых
            волокон в сутки, EFSA считает адекватным потреблением 25 г, ВОЗ — не менее 25 г. Мы
            берём расчёт от калорийности: тому, кто ест 3000 ккал, 25 граммов мало, а тому, кто ест
            1400, — уже прилично.
          </p>
        </div>
      </div>
    </div>

    <div className="raschet-form">
      <fieldset>
        <legend>Чем закрыть норму</legend>
        <p className="raschet-hint">
          Сортировка по клетчатке в обычной порции, а не на 100 г: на 100 г побеждают отруби,
          которых никто не ест стаканами.
        </p>
        <div className="raschet-table-scroll">
          <table className="raschet-table">
            <thead>
              <tr><th>Продукт</th><th>Порция</th><th>Клетчатки</th><th>Доля нормы</th></tr>
            </thead>
            <tbody>
              {sources.map((food) => <tr key={food.name}>
                <td>{food.name}</td>
                <td>{food.portionG} г</td>
                <td>{food.perPortion} г</td>
                <td>{Math.round((food.perPortion / target.target) * 100)}%</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </fieldset>
    </div>
  </>;
}
