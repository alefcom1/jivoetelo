"use client";

// Добавление позиции руками в вебе: поиск по справочнику, а если там пусто —
// числа с упаковки.
//
// Зачем понадобилось. Справочник (`lib/food-reference.ts`) вызывался только
// из Mini App, и в веб-кабинете «+ Добавить позицию» давала форму с нулями во
// всех полях. Именно так в дневнике появилась запись «Салат овощной, 300 г —
// 0 ккал»: человек не поленился, ему просто неоткуда было взять числа.
//
// Модуль справочника чистый и от Telegram не зависит — единственное, что
// мешало, это то, что компонент с ним жил в `app/tg/`. Здесь тот же поиск, но
// в разметке кабинета.

import { useState } from "react";
import { searchFoodReference, type ReferenceFood } from "@/lib/food-reference";
import { BarcodeScanner } from "../barcode-scanner";
import { FoodIcon } from "../food-icon";

/** Позиция в том виде, в каком её ждут оба экрана кабинета. */
export type NewFoodItem = {
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  confidence: string;
};

function fromReference(food: ReferenceFood): NewFoodItem {
  return {
    name: food.name,
    grams: food.portionG,
    kcalPer100: food.kcal,
    proteinPer100: food.protein,
    fatPer100: food.fat,
    carbsPer100: food.carbs,
    fiberPer100: food.fiber,
    // Справочное значение — не догадка модели по фотографии. Подписи
    // «средняя уверенность» на такой позиции быть не должно.
    confidence: "high",
  };
}

/** Число из поля: запятая как разделитель, пусто и мусор — ноль. */
function num(value: string, max: number): number {
  const parsed = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(max, parsed);
}

const EMPTY_FORM = { name: "", grams: "100", kcal: "", protein: "", fat: "", carbs: "", fiber: "" };

export function AddFoodItem({ onAdd }: { onAdd: (item: NewFoodItem) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const found = searchFoodReference(query);

  function reset() {
    setOpen(false);
    setManual(false);
    setScanning(false);
    setQuery("");
    setError(null);
    setForm(EMPTY_FORM);
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
    return <button className="link-button" type="button" onClick={() => setOpen(true)}>
      + Добавить позицию
    </button>;
  }

  if (scanning) {
    return <BarcodeScanner
      endpoint="/api/barcode"
      onItem={(item) => { onAdd(item); reset(); }}
      onClose={() => setScanning(false)}
    />;
  }

  return <section className="add-food">
    <div className="add-food-head">
      <strong>Добавить позицию</strong>
      <button className="draft-remove" type="button" aria-label="Закрыть" onClick={reset}>×</button>
    </div>

    {/* Штрихкод первым: у упакованного продукта это самый точный путь из
        всех — числа с этикетки, а не оценка по названию. */}
    <button className="add-food-scan" type="button" onClick={() => setScanning(true)}>
      Сканировать штрихкод
    </button>

    <input
      className="add-food-search"
      type="search"
      placeholder="Начните вводить: творог, гречка, яблоко…"
      value={query}
      onChange={(e) => { setQuery(e.target.value); setError(null); }}
      autoFocus
    />

    {!manual && found.length > 0 && <ul className="add-food-results">
      {found.map((food) => <li key={food.name}>
        <button type="button" onClick={() => { onAdd(fromReference(food)); reset(); }}>
          <FoodIcon name={food.name} size="sm" />
          <span className="add-food-name">{food.name}</span>
          <span className="add-food-kcal">{food.kcal}<i> ккал/100 г</i></span>
        </button>
      </li>)}
    </ul>}

    {/* Пустой результат — не тупик: путь дальше должен быть виден сразу, а не
        после второй попытки. */}
    {!manual && query.trim().length >= 2 && found.length === 0 &&
      <p className="field-note">В справочнике этого нет. Введите числа с упаковки — или опишите еду текстом на вкладке «Добавить», там разберёт модель.</p>}

    {!manual
      ? <button className="link-button" type="button" onClick={() => { setManual(true); setForm({ ...EMPTY_FORM, name: query.trim() }); }}>
          Ввести КБЖУ вручную
        </button>
      : <div className="add-food-manual">
          <label className="add-food-field">
            Название
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="например, творожная запеканка" />
          </label>
          <p className="field-note">Значения на 100 г — как на упаковке. Пустое поле считается нулём.</p>
          <div className="per100-grid">
            {([
              ["grams", "вес порции, г"],
              ["kcal", "ккал / 100 г"],
              ["protein", "белки"],
              ["fat", "жиры"],
              ["carbs", "углеводы"],
              ["fiber", "клетчатка"],
            ] as Array<[keyof typeof form, string]>).map(([key, label]) => <label key={key}>
              {label}
              <input
                type="number" inputMode="decimal" min={0} step="0.1"
                value={form[key]}
                onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setError(null); }}
              />
            </label>)}
          </div>
        </div>}

    {error && <p className="form-error">{error}</p>}
    {manual && <button className="black-button" type="button" onClick={addManual}>Добавить</button>}
  </section>;
}
