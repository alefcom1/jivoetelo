"use client";

// Витамины и минералы. Отличие от русских таблиц «норма витамина C — 90 мг»
// в том, что мы отвечаем на следующий вопрос: сколько граммов конкретного
// продукта эти 90 мг дают. Справочник у нас уже есть, и без этого шага
// страница остаётся набором чисел, с которыми нечего делать.

import { useState } from "react";
import {
  MICRONUTRIENTS,
  MICRO_GROUPS,
  gramsForNorm,
  normFor,
  nutrientsIn,
} from "@/lib/micronutrients";
import { ru } from "../format";

export default function NutrientsForm() {
  const [sex, setSex] = useState<"female" | "male">("female");
  const [active, setActive] = useState(MICRONUTRIENTS[0].key);
  const nutrient = MICRONUTRIENTS.find((item) => item.key === active) ?? MICRONUTRIENTS[0];
  const norm = normFor(nutrient, sex);

  return <>
    <div className="raschet-form" role="group" aria-label="Нормы витаминов и минералов">
      <fieldset>
        <legend>Для кого считаем</legend>
        <div className="raschet-choice">
          {(["female", "male"] as const).map((key) => <button key={key} type="button"
            className={sex === key ? "active" : ""} onClick={() => setSex(key)}
            aria-pressed={sex === key}>
            {key === "female" ? "Женщина" : "Мужчина"}
          </button>)}
        </div>
        <p className="raschet-hint">
          Нормы взрослого 18–59 лет. Различаются по полу они только у железа — и различаются
          почти вдвое, поэтому переключатель здесь не для галочки.
        </p>
      </fieldset>

      <fieldset>
        <legend>Выберите нутриент</legend>
        {MICRO_GROUPS.map((group) => <div key={group} className="nutrient-group">
          <p className="nutrient-group-title">{group}</p>
          <div className="raschet-choice">
            {nutrientsIn(group).map((item) => <button key={item.key} type="button"
              className={item.key === active ? "active" : ""} onClick={() => setActive(item.key)}
              aria-pressed={item.key === active}>
              {item.name}
            </button>)}
          </div>
        </div>)}
      </fieldset>

      <div className="raschet-result">
        <div className="raschet-range-card">
          <p className="raschet-range">{norm} {nutrient.unit} <span>{nutrient.name.toLowerCase()} в сутки</span></p>
          <div className="raschet-submetrics">
            <div><strong>{nutrient.group === "Витамины" ? "Витамин" : "Минерал"}</strong><span>Тип нутриента</span></div>
            <div>
              <strong>{nutrient.upper ? `${nutrient.upper} ${nutrient.unit}` : "не задан"}</strong>
              <span>Верхний предел</span>
            </div>
          </div>
          <p className="raschet-adjusted">{nutrient.role}</p>
        </div>
      </div>

      <fieldset>
        <legend>Чем закрыть норму</legend>
        <p className="raschet-hint">
          Третья колонка — сколько граммов продукта закрывают суточную норму целиком. Иногда это
          ложка, иногда полкилограмма: именно из этого сравнения видно, какие продукты работают.
        </p>
        <div className="raschet-table-scroll">
          <table className="raschet-table">
            <thead>
              <tr>
                <th>Продукт</th>
                <th>На 100 г</th>
                <th>Норма закрывается</th>
                <th>Доля нормы в 100 г</th>
              </tr>
            </thead>
            <tbody>
              {[...nutrient.sources]
                .sort((a, b) => b.per100 - a.per100)
                .map((source) => {
                  const grams = gramsForNorm(nutrient, sex, source.per100);
                  return <tr key={source.name}>
                    <td>{source.name}</td>
                    <td>{ru(source.per100)} {nutrient.unit}</td>
                    <td>{grams < 1000 ? `${grams} г` : `${ru(grams / 1000)} кг`}</td>
                    <td>{Math.round((source.per100 / norm) * 100)}%</td>
                  </tr>;
                })}
            </tbody>
          </table>
        </div>
        {nutrient.note && <div className="raschet-caveats"><p>{nutrient.note}</p></div>}
      </fieldset>
    </div>

    <div className="raschet-form">
      <fieldset>
        <legend>Все двенадцать норм разом</legend>
        <p className="raschet-hint">
          Таблицу удобно сохранить: это те же цифры, что в МР 2.3.1.0253-21, только рядом с самым
          доступным источником каждого нутриента.
        </p>
        <div className="raschet-table-scroll">
          <table className="raschet-table">
            <thead>
              <tr>
                <th>Нутриент</th>
                <th>Норма</th>
                <th>Верхний предел</th>
                <th>Чем закрыть проще всего</th>
              </tr>
            </thead>
            <tbody>
              {MICRONUTRIENTS.map((item) => {
                const best = [...item.sources].sort((a, b) => b.per100 - a.per100)[0];
                const grams = best ? gramsForNorm(item, sex, best.per100) : 0;
                return <tr key={item.key}>
                  <td>{item.name}</td>
                  <td>{ru(normFor(item, sex))} {item.unit}</td>
                  <td>{item.upper ? `${item.upper} ${item.unit}` : "—"}</td>
                  <td>{best ? `${best.name.toLowerCase()}, ${grams < 1000 ? `${grams} г` : `${ru(grams / 1000)} кг`}` : "—"}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </fieldset>
    </div>
  </>;
}
