"use client";

import { useEffect, useRef, useState } from "react";
import {
  analyzeMeal,
  saveMeal,
  type AnalysisItemDto,
  type ClarificationDto,
} from "./api";
import { haptic, useMainButtonApi } from "./telegram";

type DraftItem = {
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  confidence: string;
};

const CONFIDENCE_LABELS: Record<string, string> = { medium: "примерно", low: "неточно" };

const MEAL_TYPES: Array<[string, string]> = [
  ["breakfast", "Завтрак"],
  ["lunch", "Обед"],
  ["dinner", "Ужин"],
  ["snack", "Перекус"],
];

function toDraft(item: AnalysisItemDto): DraftItem {
  return {
    name: item.name,
    grams: item.estimatedGrams,
    kcalPer100: item.per100g.kcal,
    proteinPer100: item.per100g.protein,
    fatPer100: item.per100g.fat,
    carbsPer100: item.per100g.carbs,
    fiberPer100: item.per100g.fiber,
    confidence: item.confidence,
  };
}

function guessMealType(): string {
  const hour = new Date().getHours();
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

export function AddTab({ showCalories, onSaved }: { showCalories: boolean; onSaved: () => void }) {
  const [mode, setMode] = useState<"text" | "photo">("text");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DraftItem[] | null>(null);
  const [clarifications, setClarifications] = useState<ClarificationDto[]>([]);
  const [analysis, setAnalysis] = useState<unknown>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [mealType, setMealType] = useState(guessMealType());
  const fileRef = useRef<HTMLInputElement>(null);
  const mainButton = useMainButtonApi();

  async function handleAnalyze() {
    setError(null);
    const formData = new FormData();
    formData.set("mode", mode);
    if (mode === "photo") {
      const file = fileRef.current?.files?.[0];
      if (!file) { setError("Выберите фото."); return; }
      formData.set("photo", file);
    } else {
      if (text.trim().length < 3) { setError("Опишите еду хотя бы парой слов."); return; }
      formData.set("text", text);
    }

    setBusy(true);
    try {
      const result = await analyzeMeal(formData);
      haptic("tap");
      setItems(result.analysis.items.map(toDraft));
      setClarifications(result.analysis.clarifications);
      setAnalysis(result.analysis);
      setPhotoKey(result.photoKey);
      setSourceText(result.sourceText);
      if (result.analysis.mealType !== "other") setMealType(result.analysis.mealType);
    } catch (err) {
      haptic("error");
      setError(err instanceof Error && err.message !== "error" ? err.message : "Не получилось разобрать. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!items || items.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      await saveMeal({
        eatenOn: now.toLocaleDateString("en-CA"),
        eatenTime: now.toTimeString().slice(0, 5),
        mealType,
        sourceText,
        photoKey,
        analysis,
        items,
      });
      onSaved();
    } catch (err) {
      haptic("error");
      setError(err instanceof Error && err.message !== "error" ? err.message : "Не получилось сохранить.");
    } finally {
      setBusy(false);
    }
  }

  // Нативная кнопка Telegram — основное действие текущего шага.
  useEffect(() => {
    if (busy) return;
    return items
      ? mainButton.show("Сохранить", () => void handleSave())
      : mainButton.show("Разобрать", () => void handleAnalyze());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, busy, text, mode, mealType]);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current && current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function applyClarification(clarIndex: number, optionIndex: number) {
    haptic("tap");
    const option = clarifications[clarIndex]?.options[optionIndex];
    if (option?.addItem) setItems((current) => (current ? [...current, toDraft(option.addItem!)] : current));
    setClarifications((current) => current.filter((_, i) => i !== clarIndex));
  }

  if (!items) {
    return <div className="tg-page">
      <header className="tg-hero"><h1>Что вы ели?</h1></header>

      <div className="tg-segment" role="tablist">
        <button role="tab" aria-selected={mode === "text"} className={mode === "text" ? "active" : ""}
          onClick={() => { haptic("tap"); setMode("text"); }}>Текстом</button>
        <button role="tab" aria-selected={mode === "photo"} className={mode === "photo" ? "active" : ""}
          onClick={() => { haptic("tap"); setMode("photo"); }}>Фото</button>
      </div>

      {mode === "text"
        ? <textarea className="tg-input" rows={3} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Например: два сырника, ложка сметаны и капучино" />
        : <div className="tg-photo">
            <label className="tg-photo-drop">
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={(e) => {
                const file = e.target.files?.[0];
                setPreview((old) => { if (old) URL.revokeObjectURL(old); return file ? URL.createObjectURL(file) : null; });
              }} />
              {preview
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={preview} alt="Предпросмотр блюда" />
                : <span>Снимите блюдо или выберите фото</span>}
            </label>
          </div>}

      {error && <p className="tg-error">{error}</p>}
      {busy && <p className="tg-hint">Разбираем… обычно это несколько секунд.</p>}

      {/* Дублируем действие в интерфейсе: MainButton недоступна вне Telegram. */}
      <button className="tg-button tg-button-block" onClick={() => void handleAnalyze()} disabled={busy}>
        {busy ? "Разбираем…" : "Разобрать"}
      </button>
    </div>;
  }

  const totals = items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + Math.round((item.kcalPer100 * item.grams) / 100),
      protein: acc.protein + (item.proteinPer100 * item.grams) / 100,
      fiber: acc.fiber + (item.fiberPer100 * item.grams) / 100,
    }),
    { kcal: 0, protein: 0, fiber: 0 },
  );

  return <div className="tg-page">
    <header className="tg-hero">
      <h1>Проверьте разбор</h1>
      <p className="tg-hint">Оценка приблизительная — поправьте вес, если нужно.</p>
    </header>

    {clarifications.map((clar, clarIndex) => <div className="tg-clarify" key={clar.question}>
      <p>{clar.question}</p>
      <div>
        {clar.options.map((option, optionIndex) => <button key={option.label}
          onClick={() => applyClarification(clarIndex, optionIndex)}>{option.label}</button>)}
      </div>
    </div>)}

    <ul className="tg-draft">
      {items.map((item, index) => <li key={index}>
        <div className="tg-draft-row">
          <b>{item.name}</b>
          <div className="tg-stepper">
            <button aria-label="Меньше" onClick={() => { haptic("tap"); updateItem(index, { grams: Math.max(1, item.grams - 10) }); }}>−</button>
            <span>{item.grams} г</span>
            <button aria-label="Больше" onClick={() => { haptic("tap"); updateItem(index, { grams: Math.min(3000, item.grams + 10) }); }}>+</button>
          </div>
        </div>
        <div className="tg-draft-meta">
          {CONFIDENCE_LABELS[item.confidence] && <i>{CONFIDENCE_LABELS[item.confidence]}</i>}
          {showCalories && <span>{Math.round((item.kcalPer100 * item.grams) / 100)} ккал</span>}
          <span>белок {Math.round((item.proteinPer100 * item.grams) / 10) / 10} г</span>
          <button className="tg-remove" aria-label="Убрать позицию"
            onClick={() => { haptic("tap"); setItems((c) => c && c.filter((_, i) => i !== index)); }}>×</button>
        </div>
      </li>)}
    </ul>

    <div className="tg-card tg-draft-total">
      {showCalories && <div><strong>{totals.kcal}</strong><span>ккал</span></div>}
      <div><strong>{Math.round(totals.protein * 10) / 10}</strong><span>белок, г</span></div>
      <div><strong>{Math.round(totals.fiber * 10) / 10}</strong><span>клетчатка, г</span></div>
    </div>

    <div className="tg-segment tg-segment-wrap">
      {MEAL_TYPES.map(([value, label]) => <button key={value} className={mealType === value ? "active" : ""}
        onClick={() => { haptic("tap"); setMealType(value); }}>{label}</button>)}
    </div>

    {error && <p className="tg-error">{error}</p>}
    <button className="tg-button tg-button-block" onClick={() => void handleSave()} disabled={busy}>
      {busy ? "Сохраняем…" : "Сохранить"}
    </button>
    <button className="tg-link tg-link-block" onClick={() => { setItems(null); setError(null); }}>← Начать заново</button>
  </div>;
}
