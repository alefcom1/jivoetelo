"use client";

import { useRef, useState } from "react";
import type { AnalysisItem, Clarification, MealAnalysis } from "@/lib/ai";
import { MEAL_TYPE_LABELS } from "@/lib/dates";
import { sumTotals } from "@/lib/nutrition";
import { scaleGrams } from "@/lib/portions";
import { analyzeMeal, saveMeal } from "../meal-actions";

type DraftItem = {
  name: string;
  grams: number;
  // Вес, который предложила модель — нужен только для кнопки «сброс», в БД не уходит.
  suggestedGrams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  confidence: string;
};

type Draft = {
  items: DraftItem[];
  clarifications: Clarification[];
  analysis: MealAnalysis | null;
  photoKey: string | null;
  sourceText: string | null;
  mealType: string;
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "уверенно",
  medium: "примерно",
  low: "неточно",
};

function toDraftItem(item: AnalysisItem): DraftItem {
  return {
    name: item.name,
    grams: item.estimatedGrams,
    suggestedGrams: item.estimatedGrams,
    kcalPer100: item.per100g.kcal,
    proteinPer100: item.per100g.protein,
    fatPer100: item.per100g.fat,
    carbsPer100: item.per100g.carbs,
    fiberPer100: item.per100g.fiber,
    confidence: item.confidence,
  };
}

function emptyItem(): DraftItem {
  return { name: "", grams: 100, suggestedGrams: 100, kcalPer100: 0, proteinPer100: 0, fatPer100: 0, carbsPer100: 0, fiberPer100: 0, confidence: "high" };
}

function formatTakenAt(inbox: InboxDraft): string {
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(
    new Date(`${inbox.takenOn}T12:00:00Z`),
  );
  return `Снято ${day} в ${inbox.takenTime}`;
}

function guessMealType(time: string): string {
  const hour = Number(time.slice(0, 2));
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

/** Снимок из фото-инбокса, если разбор начат оттуда. */
export type InboxDraft = {
  id: number;
  photoKey: string;
  note: string | null;
  takenOn: string;
  takenTime: string;
};

export function AddMealFlow({ showCalories, inbox }: { showCalories: boolean; inbox?: InboxDraft | null }) {
  const now = new Date();
  const [mode, setMode] = useState<"text" | "photo">(inbox ? "photo" : "text");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Для снимка из инбокса дата и время берутся из момента съёмки, а не из
  // момента разбора: фото, снятое в обед и разобранное вечером, — это всё
  // равно обед.
  const [date, setDate] = useState(inbox?.takenOn ?? now.toLocaleDateString("en-CA"));
  const [time, setTime] = useState(inbox?.takenTime ?? now.toTimeString().slice(0, 5));
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAnalyze() {
    setError(null);
    const formData = new FormData();
    formData.set("mode", inbox ? "inbox" : mode);
    if (inbox) {
      formData.set("inboxId", String(inbox.id));
    } else if (mode === "photo") {
      const file = fileRef.current?.files?.[0];
      if (!file) { setError("Выберите фото."); return; }
      formData.set("photo", file);
      formData.set("note", note);
    } else {
      if (text.trim().length < 3) { setError("Опишите еду хотя бы парой слов."); return; }
      formData.set("text", text);
    }
    setBusy(true);
    try {
      const result = await analyzeMeal(formData);
      if (!result.ok) { setError(result.error); return; }
      setDraft({
        items: result.analysis.items.map(toDraftItem),
        clarifications: result.analysis.clarifications,
        analysis: result.analysis,
        photoKey: result.photoKey,
        sourceText: result.sourceText,
        mealType: result.analysis.mealType === "other" ? guessMealType(time) : result.analysis.mealType,
      });
    } catch {
      setError("Что-то пошло не так. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  function startManual() {
    setError(null);
    setDraft({
      items: [emptyItem()],
      clarifications: [],
      analysis: null,
      photoKey: null,
      sourceText: text.trim() || null,
      mealType: guessMealType(time),
    });
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setDraft((d) => d && { ...d, items: d.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  }

  function removeItem(index: number) {
    setDraft((d) => d && { ...d, items: d.items.filter((_, i) => i !== index) });
  }

  function applyClarification(clarIndex: number, optionIndex: number) {
    setDraft((d) => {
      if (!d) return d;
      const option = d.clarifications[clarIndex]?.options[optionIndex];
      return {
        ...d,
        items: option?.addItem ? [...d.items, toDraftItem(option.addItem)] : d.items,
        clarifications: d.clarifications.filter((_, i) => i !== clarIndex),
      };
    });
  }

  async function handleSave() {
    if (!draft) return;
    setError(null);
    setBusy(true);
    try {
      const result = await saveMeal({
        inboxId: inbox?.id ?? null,
        eatenOn: date,
        eatenTime: time,
        mealType: draft.mealType,
        sourceText: draft.sourceText,
        photoKey: draft.photoKey,
        analysis: draft.analysis,
        // suggestedGrams — служебное поле только для интерфейса, серверный экшен его не ждёт.
        items: draft.items.map((item) => ({
          name: item.name,
          grams: item.grams,
          kcalPer100: item.kcalPer100,
          proteinPer100: item.proteinPer100,
          fatPer100: item.fatPer100,
          carbsPer100: item.carbsPer100,
          fiberPer100: item.fiberPer100,
          confidence: item.confidence,
        })),
      });
      // При успехе saveMeal делает redirect и сюда не возвращается.
      if (result && !result.ok) setError(result.error);
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    if (inbox) {
      return <main className="addflow">
        <h1>Снимок из инбокса</h1>
        <p className="addflow-hint">{formatTakenAt(inbox)}. Разберём его и подставим это же время в приём пищи.</p>
        <div className="addflow-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/photos/${inbox.photoKey}`} alt="Снимок еды из инбокса" />
          {inbox.note && <p className="addflow-hint">Ваша подпись: «{inbox.note}»</p>}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="addflow-actions">
          <button className="black-button" onClick={handleAnalyze} disabled={busy}>{busy ? "Разбираем…" : "Разобрать"}</button>
          <a className="link-button" href="/app/inbox">← В инбокс</a>
        </div>
        {busy && <p className="addflow-hint">Обычно это занимает несколько секунд.</p>}
      </main>;
    }

    return <main className="addflow">
      <h1>Что вы ели?</h1>
      <div className="addflow-tabs" role="tablist">
        <button role="tab" aria-selected={mode === "text"} className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}>Текстом</button>
        <button role="tab" aria-selected={mode === "photo"} className={mode === "photo" ? "active" : ""} onClick={() => setMode("photo")}>Фото</button>
      </div>

      {mode === "text"
        ? <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
            placeholder="Например: два сырника, ложка сметаны и капучино без сахара" autoFocus />
        : <div className="addflow-photo">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setPreview((old) => { if (old) URL.revokeObjectURL(old); return file ? URL.createObjectURL(file) : null; });
              }} />
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Предпросмотр фото еды" />
            )}
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Комментарий к фото (необязательно)" />
          </div>}

      {error && <p className="form-error">{error}</p>}
      <div className="addflow-actions">
        <button className="black-button" onClick={handleAnalyze} disabled={busy}>{busy ? "Разбираем…" : "Разобрать"}</button>
        <button className="link-button" onClick={startManual} disabled={busy}>Заполнить вручную</button>
      </div>
      {busy && <p className="addflow-hint">Обычно это занимает несколько секунд.</p>}
    </main>;
  }

  const totals = sumTotals(draft.items);

  return <main className="addflow">
    <h1>Проверьте разбор</h1>
    <p className="addflow-hint">Оценка приблизительная — поправьте вес или состав, если что-то не так.</p>

    {draft.clarifications.map((clar, clarIndex) => <div className="clarification" key={clar.question}>
      <p>{clar.question}</p>
      <div>{clar.options.map((option, optionIndex) =>
        <button key={option.label} onClick={() => applyClarification(clarIndex, optionIndex)}>{option.label}</button>)}
      </div>
    </div>)}

    <div className="draft-items">
      {draft.items.map((item, index) => <div className="draft-item" key={index}>
        <div className="draft-item-main">
          <input type="text" value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} placeholder="Название" aria-label="Название" />
          <label className="draft-grams"><input type="number" min={1} max={3000} value={item.grams}
            onChange={(e) => updateItem(index, { grams: Number(e.target.value) })} aria-label="Вес в граммах" /> г</label>
          <button className="draft-remove" onClick={() => removeItem(index)} aria-label="Убрать позицию">×</button>
        </div>
        <div className="portion-multipliers">
          <button type="button" onClick={() => updateItem(index, { grams: scaleGrams(item.grams, 0.5) })} aria-label="Уменьшить порцию вдвое">½</button>
          <button type="button" onClick={() => updateItem(index, { grams: scaleGrams(item.grams, 0.75) })} aria-label="Уменьшить порцию на четверть">¾</button>
          <button type="button" onClick={() => updateItem(index, { grams: scaleGrams(item.grams, 1.5) })} aria-label="Увеличить порцию в полтора раза">1½</button>
          <button type="button" onClick={() => updateItem(index, { grams: scaleGrams(item.grams, 2) })} aria-label="Увеличить порцию вдвое">2×</button>
          {item.grams !== item.suggestedGrams && (
            <button type="button" className="portion-reset" onClick={() => updateItem(index, { grams: item.suggestedGrams })} aria-label="Вернуть вес, предложенный моделью">сброс</button>
          )}
        </div>
        <div className="draft-item-meta">
          {item.confidence !== "high" && <i>{CONFIDENCE_LABELS[item.confidence]}</i>}
          {showCalories && <span>{Math.round((item.kcalPer100 * item.grams) / 100)} ккал</span>}
          <span>белок {Math.round((item.proteinPer100 * item.grams) / 10) / 10} г</span>
          <details>
            <summary>на 100 г</summary>
            <div className="per100-grid">
              <label>ккал<input type="number" min={0} max={900} value={item.kcalPer100} onChange={(e) => updateItem(index, { kcalPer100: Number(e.target.value) })} /></label>
              <label>белки<input type="number" min={0} max={100} value={item.proteinPer100} onChange={(e) => updateItem(index, { proteinPer100: Number(e.target.value) })} /></label>
              <label>жиры<input type="number" min={0} max={100} value={item.fatPer100} onChange={(e) => updateItem(index, { fatPer100: Number(e.target.value) })} /></label>
              <label>углеводы<input type="number" min={0} max={100} value={item.carbsPer100} onChange={(e) => updateItem(index, { carbsPer100: Number(e.target.value) })} /></label>
              <label>клетчатка<input type="number" min={0} max={50} value={item.fiberPer100} onChange={(e) => updateItem(index, { fiberPer100: Number(e.target.value) })} /></label>
            </div>
          </details>
        </div>
      </div>)}
      <button className="link-button" onClick={() => setDraft((d) => d && { ...d, items: [...d.items, emptyItem()] })}>+ Добавить позицию</button>
    </div>

    <div className="draft-summary">
      {showCalories && <div><strong>{totals.kcal}</strong><span>ккал</span></div>}
      <div><strong>{totals.protein}</strong><span>белок, г</span></div>
      <div><strong>{totals.fiber}</strong><span>клетчатка, г</span></div>
    </div>

    <div className="draft-meta">
      <label>Приём
        <select value={draft.mealType} onChange={(e) => setDraft((d) => d && { ...d, mealType: e.target.value })}>
          {Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Дата<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>Время<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
    </div>

    {error && <p className="form-error">{error}</p>}
    <div className="addflow-actions">
      <button className="black-button" onClick={handleSave} disabled={busy}>{busy ? "Сохраняем…" : "Сохранить"}</button>
      <button className="link-button" onClick={() => { setDraft(null); setError(null); }} disabled={busy}>← Назад</button>
    </div>
  </main>;
}
