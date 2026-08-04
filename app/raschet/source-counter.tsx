"use client";

// Список «сколько порций за день» — общий для соли, сахара, кофеина и
// алкоголя. Все четыре расчёта устроены одинаково: человек отмечает, что
// съел или выпил, а мы складываем. Раньше это был бы четвёртый экземпляр
// одного и того же кода со своими опечатками в шагах и границах.
//
// Счётчик, а не флажок: одна банка газировки и три банки — это разные
// ответы, а спрашивать «сколько» через ввод числа на телефоне неудобно.

export type CounterItem = { name: string; portion: string; note?: string };

export default function SourceCounter({
  items,
  values,
  onChange,
  legend,
  hint,
  max = 12,
}: {
  items: readonly CounterItem[];
  values: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  legend: string;
  hint?: string;
  max?: number;
}) {
  const set = (name: string, next: number) => {
    onChange({ ...values, [name]: Math.min(max, Math.max(0, next)) });
  };

  return <fieldset>
    <legend>{legend}</legend>
    {hint && <p className="raschet-hint">{hint}</p>}
    <ul className="measure-list">
      {items.map((item) => {
        const count = values[item.name] ?? 0;
        return <li key={item.name} className={count > 0 ? "counter-picked" : undefined}>
          <span className="measure-name">
            {item.name}
            <i>{item.portion}{item.note ? ` · ${item.note}` : ""}</i>
          </span>
          <span className="measure-stepper">
            <button type="button" onClick={() => set(item.name, count - 1)}
              disabled={count === 0} aria-label={`${item.name}: убрать порцию`}>−</button>
            <b aria-live="off">{count}</b>
            <button type="button" onClick={() => set(item.name, count + 1)}
              disabled={count >= max} aria-label={`${item.name}: добавить порцию`}>+</button>
          </span>
        </li>;
      })}
    </ul>
  </fieldset>;
}

/** Сбросить всё в ноль — кнопка «начать заново» есть на каждой из страниц. */
export function ResetButton({ onReset, disabled }: { onReset: () => void; disabled: boolean }) {
  return <button type="button" className="link-button counter-reset" onClick={onReset} disabled={disabled}>
    Очистить
  </button>;
}
