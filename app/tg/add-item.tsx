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
import { parseNutrient, searchFoodReference, type ReferenceFood } from "@/lib/food-reference";
import { BarcodeScanner } from "../barcode-scanner";
import { FoodIcon } from "../food-icon";
import { productToItem, useProductSearch } from "../use-product-search";
import { getWebApp, haptic } from "./telegram";

const EMPTY_FORM = { name: "", grams: "100", kcal: "", protein: "", fat: "", carbs: "", fiber: "" };

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

/** Поля ручного ввода и их потолки — те же границы, что проверяет сервер. */
const MANUAL_FIELDS: Array<[keyof typeof EMPTY_FORM, string, number]> = [
  ["grams", "Вес порции, г", 3000],
  ["kcal", "Ккал / 100 г", 900],
  ["protein", "Белки, г", 100],
  ["fat", "Жиры, г", 100],
  ["carbs", "Углеводы, г", 100],
  // Клетчатки сервер принимает до 50 на 100 г, а не до 100 (lib/meals.ts):
  // разойтись здесь значило бы молча срезать уже принятое формой число.
  ["fiber", "Клетчатка, г", 50],
];

export function AddItem({
  onAdd,
  startOpen = false,
}: {
  onAdd: (item: NewItem) => void;
  /** Экран, где добавление руками — единственное действие: сворачивать нечего. */
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const found = searchFoodReference(query);
  // Товары, заведённые людьми по штрихкоду: справочник в бандле маленький и
  // курируемый, растущая база живёт на сервере (app/use-product-search.ts).
  const fromBase = useProductSearch(query, "/api/tg/barcode", { "x-telegram-init-data": getWebApp()?.initData ?? "" }, found.map((f) => f.name));

  function reset() {
    // На экране, где блок открыт изначально, сворачивать его нельзя: это
    // оставило бы пустой экран без единого действия.
    setOpen(startOpen);
    setManual(false);
    setScanning(false);
    setQuery("");
    setError(null);
    setForm(EMPTY_FORM);
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
    const grams = parseNutrient(form.grams, 3000);
    if (grams < 1) {
      setError("Укажите вес порции в граммах.");
      return;
    }
    haptic("success");
    onAdd({
      name: name.slice(0, 120),
      grams: Math.round(grams),
      kcalPer100: parseNutrient(form.kcal, 900),
      proteinPer100: parseNutrient(form.protein, 100),
      fatPer100: parseNutrient(form.fat, 100),
      carbsPer100: parseNutrient(form.carbs, 100),
      fiberPer100: parseNutrient(form.fiber, 50),
      confidence: "medium",
    });
    reset();
  }

  if (!open) {
    return <button className="tg-link-button tg-add-item-open" onClick={() => { haptic("tap"); setOpen(true); }}>
      + Добавить позицию
    </button>;
  }

  if (scanning) {
    return <BarcodeScanner
      endpoint="/api/tg/barcode"
      headers={{ "x-telegram-init-data": getWebApp()?.initData ?? "" }}
      onItem={(item) => { haptic("success"); onAdd(item); reset(); }}
      onClose={() => setScanning(false)}
    />;
  }

  return <section className="tg-card tg-add-item">
    <div className="tg-add-item-head">
      <h3>Добавить позицию</h3>
      {!startOpen && <button className="tg-remove" aria-label="Закрыть" onClick={reset}>×</button>}
    </div>

    {/* Штрихкод первым: у упакованного продукта это самый точный путь из
        всех — числа с этикетки, а не оценка по названию. */}
    <button className="tg-button tg-scan-open" onClick={() => { haptic("tap"); setScanning(true); }}>
      Сканировать штрихкод
    </button>

    {/* В ручном вводе строка поиска не нужна: название там задаётся своим
        полем, и два поля с одним и тем же словом только сбивают с толку.
        Кнопка сканирования, наоборот, остаётся: руками числа переписывают
        как раз с упаковки, которая в этот момент в руках.
        Фокус ставим, только когда блок раскрыт нажатием, — там это ровно то,
        чего человек хотел. Где блок открыт изначально, выскочившая при
        переключении экрана клавиатура закрыла бы пол-экрана. */}
    {!manual && <input
      className="tg-input"
      type="search"
      placeholder="Начните вводить: творог, гречка, яблоко…"
      value={query}
      onChange={(e) => { setQuery(e.target.value); setError(null); }}
      autoFocus={!startOpen}
    />}

    {!manual && found.length > 0 && <ul className="tg-add-item-results">
      {found.map((food) => <li key={food.name}>
        <button onClick={() => addFromReference(food)}>
          <FoodIcon name={food.name} size="sm" />
          <span className="tg-add-item-name">{food.name}</span>
          <span className="tg-add-item-kcal">{food.kcal}<i> ккал/100 г</i></span>
        </button>
      </li>)}
    </ul>}

    {!manual && fromBase.length > 0 && <>
      {/* Подпись обязательна: эти карточки завели люди, а не мы, и верить им
          надо иначе, чем справочнику. */}
      <p className="tg-hint tg-add-item-source">Из базы товаров — завели пользователи</p>
      <ul className="tg-add-item-results">
      {fromBase.map((item) => <li key={item.code}>
        <button onClick={() => { haptic("success"); onAdd(productToItem(item)); reset(); }}>
          <FoodIcon name={item.name} size="sm" />
          <span className="tg-add-item-name">
            {item.name}
            {/* «Проверено людьми» — не украшение: карточку заводит кто угодно,
                и число подтверждений говорит, насколько ей верить. */}
            {item.confirmations > 0 && <i> · подтверждали {item.confirmations}</i>}
          </span>
          <span className="tg-add-item-kcal">{item.kcalPer100}<i> ккал/100 г</i></span>
        </button>
      </li>)}
      </ul>
    </>}

    {/* Пустой результат — не тупик: справочник намеренно небольшой, и путь
        дальше должен быть виден сразу, а не после второй попытки. */}
    {!manual && query.trim().length >= 2 && found.length === 0 && fromBase.length === 0 &&
      <p className="tg-hint">В справочнике этого нет. Введите числа с упаковки или опишите еду на вкладке «Камера» — там разберёт модель.</p>}

    {!manual
      ? <button className="tg-link-button" onClick={() => { haptic("tap"); setManual(true); setForm({ ...EMPTY_FORM, name: query.trim() }); }}>
          Ввести КБЖУ вручную
        </button>
      : <div className="tg-add-item-manual">
          <label className="tg-field">
            Название
            <input className="tg-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="например, творожная запеканка" />
          </label>
          <p className="tg-hint">Значения на 100 г — как на упаковке. Пустое поле считается нулём.</p>
          <div className="tg-add-item-grid">
            {MANUAL_FIELDS.map(([key, label, max]) => <label key={key} className="tg-field">
              {label}
              <input
                className="tg-input" type="number" inputMode="decimal" min={0} max={max} step="0.1"
                value={form[key]}
                onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setError(null); }}
              />
            </label>)}
          </div>
        </div>}

    {error && <p className="tg-error">{error}</p>}
    {manual && <>
      <button className="tg-button tg-button-block" onClick={addManual}>Добавить</button>
      {/* Уйти в ручной ввод легко, вернуться — тоже: без этой строки поиск по
          справочнику пропадал бы до закрытия всего блока. */}
      <button className="tg-link-button" onClick={() => { haptic("tap"); setManual(false); setError(null); }}>
        ← Искать в справочнике
      </button>
    </>}
  </section>;
}
