"use client";

// Таблица мер с поиском и счётчиком набора. Поиск нужен не ради красоты:
// в таблице три десятка строк, а человек пришёл за одной — «сколько грамм
// муки в стакане». Счётчик снизу отвечает на второй вопрос того же
// человека: «а если два стакана и ложка».

import { useState } from "react";
import {
  MEASURES,
  MEASURE_GROUPS,
  MEASURE_LABELS,
  weighMeasures,
  type MeasureKey,
  type MeasureRow,
} from "@/lib/kitchen-measures";

export default function MeasuresTable() {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<MeasureRow>(MEASURES[0]);
  const [counts, setCounts] = useState<Partial<Record<MeasureKey, number>>>({ glass250: 1 });

  const needle = query.trim().toLowerCase();
  const rows = needle ? MEASURES.filter((row) => row.name.toLowerCase().includes(needle)) : MEASURES;
  const total = weighMeasures(picked, counts);

  function bump(key: MeasureKey, delta: number) {
    setCounts((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 0) + delta) }));
  }

  return <>
    <div className="raschet-form">
      <label className="field">
        Найти продукт
        <input type="search" value={query} placeholder="мука, сахар, рис…"
          onChange={(e) => setQuery(e.target.value)} />
      </label>

      <div className="raschet-table-scroll">
        <table className="raschet-table measures-table">
          <thead>
            <tr>
              <th>Продукт</th>
              <th>Стакан<br />250 мл</th>
              <th>Стакан<br />200 мл</th>
              <th>Ст. ложка</th>
              <th>Ч. ложка</th>
            </tr>
          </thead>
          <tbody>
            {MEASURE_GROUPS.map((group) => {
              const inGroup = rows.filter((row) => row.group === group);
              if (inGroup.length === 0) return null;
              return <MeasureGroup key={group} group={group} rows={inGroup}
                onPick={(row) => { setPicked(row); setCounts({ glass250: 1 }); }} />;
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="raschet-hint">Ничего не нашлось. Попробуйте короче: «мук», «сах».</p>}
    </div>

    <div className="raschet-form measures-counter">
      <fieldset>
        <legend>Посчитать набор: {picked.name}</legend>
        <ul className="measure-list">
          {(Object.keys(MEASURE_LABELS) as MeasureKey[]).map((key) => <li key={key}>
            <span className="measure-name">
              {MEASURE_LABELS[key]}
              <i>{picked[key]} г</i>
            </span>
            <span className="measure-stepper">
              <button type="button" aria-label={`Убрать: ${MEASURE_LABELS[key]}`} onClick={() => bump(key, -1)}>−</button>
              <b>{counts[key] ?? 0}</b>
              <button type="button" aria-label={`Добавить: ${MEASURE_LABELS[key]}`} onClick={() => bump(key, 1)}>+</button>
            </span>
          </li>)}
        </ul>
        <p className="converter-answer">Итого <b>{total} г</b></p>
        {picked.note && <p className="raschet-hint">{picked.note}</p>}
      </fieldset>
    </div>
  </>;
}

function MeasureGroup({ group, rows, onPick }: {
  group: string;
  rows: MeasureRow[];
  onPick: (row: MeasureRow) => void;
}) {
  return <>
    <tr className="measures-group"><th colSpan={5} scope="colgroup">{group}</th></tr>
    {rows.map((row) => <tr key={row.name}>
      <td>
        <button type="button" className="measures-pick" onClick={() => onPick(row)}>{row.name}</button>
      </td>
      <td>{row.glass250} г</td>
      <td>{row.glass200} г</td>
      <td>{row.tablespoon} г</td>
      <td>{row.teaspoon} г</td>
    </tr>)}
  </>;
}
