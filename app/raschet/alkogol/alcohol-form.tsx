"use client";

// Калории в алкоголе. В рунете хватает калькуляторов промилле и почти нет
// калорийных — при том что в дневнике питания именно эта цифра и нужна.
// Показываем не только килокалории, но и во сколько они обходятся в
// привычных величинах: столько-то минут ходьбы, столько-то процентов нормы.

import { useState } from "react";
import { ALCOHOL_DRINKS, computeAlcohol, drinkAlcoholG, drinkKcal } from "@/lib/caffeine-alcohol";
import SourceCounter, { ResetButton } from "../source-counter";
import { ru } from "../format";

export default function AlcoholForm() {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [kcalNorm, setKcalNorm] = useState(2000);
  const result = computeAlcohol(selected);
  const picked = Object.values(selected).some((count) => count > 0);
  const share = Math.round((result.kcal / Math.max(800, kcalNorm)) * 100);

  return <div className="raschet-form" role="group" aria-label="Расчёт калорий в алкоголе">
    <SourceCounter
      items={ALCOHOL_DRINKS.map((drink) => ({
        name: drink.name,
        portion: drink.portion,
        note: `${drinkKcal(drink)} ккал · ${drinkAlcoholG(drink)} г спирта`,
      }))}
      values={selected}
      onChange={setSelected}
      legend="Что было за вечер"
      max={10}
    />

    <div className="raschet-fields">
      <label>
        Ваша норма калорий, ккал
        <input type="number" inputMode="numeric" min={800} max={5000} step={50} value={kcalNorm}
          onChange={(e) => setKcalNorm(Math.min(5000, Math.max(800, Math.round(Number(e.target.value) || 2000))))} />
      </label>
    </div>
    <p className="raschet-hint">
      Нужна только для того, чтобы показать долю: не знаете — оставьте 2000. Свою цифру даёт{" "}
      <a href="/raschet/energiya">расчёт нормы энергии</a>.
    </p>

    <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">{result.kcal} <span>ккал за вечер</span></p>
        <div className="raschet-submetrics">
          <div><strong>{result.alcoholG} г</strong><span>Чистого спирта</span></div>
          <div><strong>{ru(result.units)}</strong><span>Порций по 10 г</span></div>
          <div><strong>{share}%</strong><span>От дневной нормы</span></div>
        </div>
        <p className="raschet-adjusted">
          {!picked
            ? "Отметьте, что было. Обычный вечер — две бутылки пива или три бокала вина — обходится в 350–450 ккал, то есть примерно в полноценный ужин, о котором никто не помнит."
            : `Это ${share}% дневной нормы — и это только напитки, без закуски. Спирт даёт 7 ккал на грамм, почти как жир, и в нём нет ничего, кроме энергии: ни белка, ни витаминов, ни сытости.`}
        </p>
        {picked && <ResetButton onReset={() => setSelected({})} disabled={!picked} />}
      </div>
    </div>

    <fieldset>
      <legend>Сравнение напитков на одну порцию</legend>
      <p className="raschet-hint">
        Полезнее всего сравнивать не по объёму, а по спирту: рюмка водки и бокал вина близки по
        количеству чистого спирта, а по калориям расходятся из-за сахара.
      </p>
      <div className="raschet-table-scroll">
        <table className="raschet-table">
          <thead>
            <tr><th>Напиток</th><th>Порция</th><th>Ккал</th><th>Спирта</th><th>Из них от сахара</th></tr>
          </thead>
          <tbody>
            {[...ALCOHOL_DRINKS].sort((a, b) => drinkKcal(b) - drinkKcal(a)).map((drink) => <tr key={drink.name}>
              <td>{drink.name}</td>
              <td>{drink.portion}</td>
              <td>{drinkKcal(drink)}</td>
              <td>{drinkAlcoholG(drink)} г</td>
              <td>{drink.carbsG * 4} ккал</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </fieldset>
  </div>;
}
