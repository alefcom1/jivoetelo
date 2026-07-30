"use client";

// Добавление позиции руками — общий блок для правки записи (meal-editor.tsx)
// и черновика разбора (camera-tab.tsx). Один компонент на два экрана, а не
// две копии: позиция в обоих местах устроена одинаково, и расходиться им
// незачем.
//
// Зачем это вообще есть. Раньше еда попадала в дневник единственным путём —
// через AI-разбор. Выключенный разбор или исчерпанный дневной потолок
// расходов означали, что дневник наполнить нечем. Теперь есть путь без AI:
// поиск по справочнику (lib/food-reference.ts), а для того, чего в
// справочнике нет, — ввод чисел с упаковки.

import { useState } from "react";
import { searchFoodReference, type ReferenceFood } from "@/lib/food-reference";
import { FoodIcon } from "./food-icon";
import { haptic } from "./telegram";

/** Позиция в том виде, в каком её ждут оба экрана. */
export type NewItem = {
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  confidence: string;
};

function toNewItem(food: ReferenceFood): NewItem {
  return {
    name: food.name,
    grams: food.portionG,
    kcalPer100: food.kcal,
    proteinPer100: food.protein,
    fatPer100: food.fat,
    carbsPer100: food.carbs,
    fiberPer100: food.fiber,
    // Справочное значение — не оценка модели по фотографии: сомневаться в
    // нём незачем, и подписи «средняя уверенность» на такой позиции быть
    // не должно.
    confidence: "high",
  };
}

/** Число из поля ввода: запятая как разделитель, пусто и мусор — ноль. */
function num(value: string, max: number): number {
  const parsed = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(max, parsed);
}

export function AddItem({ onAdd }: { onAdd: (item: NewItem) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState({ name: "", grams: "100", kcal: "", protein: "", fat: "", carbs: "", fiber: "" });
  const [error, setError] = useState<string | null>(null);

  const found = searchFoodReference(query);

  function reset() {
    setOpen(false);
    setManual(false);
    setQuery("");
    setError(null);
    setForm({ name: "", grams: "100", kcal: "", protein: "", fat: "", carbs: "", fiber: "" });
  }

  function addFromReference(food: ReferenceFood) {
    haptic("success");
    onAdd(toNewItem(food));
    reset();
  }

  function addManual() {
    const name = form.name.trim() || query.trim();
    if (name.length < 2) {
      setError("Напишите, что это за продукт.");
      return;
    }
    const grams = num(form.grams, 3000);
    if (grams < 1) {
      setError("Укажите вес порции в граммах.");
      return;
    }
    haptic("success");
    onAdd({
      name: name.slice(0, 120),
      grams: Math.round(grams),
      kcalPer100: num(form.kcal, 900),
      proteinPer100: num(form.protein, 100),
      fatPer100: num(form.fat, 100),
      carbsPer100: num(form.carbs, 100),
      fiberPer100: num(form.fiber, 100),
      confidence: "medium",
    });
    reset();
  }

  if (!open) {
    return <button className="tg-link-button tg-add-item-open" onClick={() => { haptic("tap"); setOpen(true); }}>
      + Добавить позицию
    </button>;
  }

  return <section className="tg-card tg-add-item">
    <div className="tg-add-item-head">
      <h3>Добавить позицию</h3>
      <button className="tg-remove" aria-label="Закрыть" onClick={reset}>×</button>
    </div>

    <input
      className="tg-input"
      type="search"
      placeholder="Начните вводить: творог, гречка, яблоко…"
      value={query}
      onChange={(e) => { setQuery(e.target.value); setError(null); }}
      autoFocus
    />

    {!manual && found.length > 0 && <ul className="tg-add-item-results">
      {found.map((food) => <li key={food.name}>
        <button onClick={() => addFromReference(food)}>
          <FoodIcon name={food.name} size="sm" />
          <span className="tg-add-item-name">{food.name}</span>
          <span className="tg-add-item-kcal">{food.kcal}<i> ккал/100 г</i></span>
        </button>
      </li>)}
    </ul>}

    {/* Пустой результат — не тупик: справочник намеренно небольшой, и путь
        дальше должен быть виден сразу, а не после второй попытки. */}
    {!manual && query.trim().length >= 2 && found.length === 0 &&
      <p className="tg-hint">В справочнике этого нет. Введите числа с упаковки или опишите еду на вкладке «Камера» — там разберёт модель.</p>}

    {!manual
      ? <button className="tg-link-button" onClick={() => { haptic("tap"); setManual(true); setForm((f) => ({ ...f, name: query.trim() })); }}>
          Ввести КБЖУ вручную
        </button>
      : <div className="tg-add-item-manual">
          <label className="tg-field">
            Название
            <input className="tg-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="например, творожная запеканка" />
          </label>
          <p className="tg-hint">Значения на 100 г — как на упаковке. Пустое поле считается нулём.</p>
          <div className="tg-add-item-grid">
            {([
              ["grams", "Вес порции, г"],
              ["kcal", "Ккал / 100 г"],
              ["protein", "Белки, г"],
              ["fat", "Жиры, г"],
              ["carbs", "Углеводы, г"],
              ["fiber", "Клетчатка, г"],
            ] as Array<[keyof typeof form, string]>).map(([key, label]) => <label key={key} className="tg-field">
              {label}
              <input
                className="tg-input" type="number" inputMode="decimal" min={0} step="0.1"
                value={form[key]}
                onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setError(null); }}
              />
            </label>)}
          </div>
        </div>}

    {error && <p className="tg-error">{error}</p>}
    {manual && <button className="tg-button tg-button-block" onClick={addManual}>Добавить</button>}
  </section>;
}
