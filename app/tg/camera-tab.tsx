"use client";

import { useEffect, useRef, useState } from "react";
import {
  analyzeMeal,
  fetchFrequentMeals,
  saveMeal,
  type AnalysisItemDto,
  type ClarificationDto,
  type FrequentMealDto,
  type InboxItemDto,
} from "./api";
import { CONFIDENCE_LABELS, confidenceRange, overallConfidence, type Confidence } from "@/lib/confidence";
import { formatDayAgoRu, formatDayRu } from "@/lib/dates";
import { mealCategory } from "@/lib/food-category";
import { withPluralRu } from "@/lib/plural";
import { scaleGrams } from "@/lib/portions";
import { AddItem, type NewItem } from "./add-item";
import { FoodIcon } from "../food-icon";
import { ArtCamera } from "./illustrations";
import { haptic, useMainButtonApi } from "./telegram";
import { TgPhoto } from "./photo";
import { useCamera } from "../use-camera";

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
  confidence: Confidence;
};

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
    suggestedGrams: item.estimatedGrams,
    kcalPer100: item.per100g.kcal,
    proteinPer100: item.per100g.protein,
    fatPer100: item.per100g.fat,
    carbsPer100: item.per100g.carbs,
    fiberPer100: item.per100g.fiber,
    confidence: (item.confidence as Confidence) ?? "medium",
  };
}

function guessMealType(): string {
  const hour = new Date().getHours();
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

/**
 * Вкладка «Камера»: снимок сразу уходит на разбор — без промежуточного
 * подтверждения (раздел «Три отличия от макета», пункт 2, спецификации
 * Mini App v2). Тот же экран обслуживает и снимки из фото-инбокса: разбор
 * там начинается сам, как только открыт конкретный снимок, потому что
 * намерение уже выражено выбором снимка на предыдущем экране.
 *
 * ## Почему видоискатель включается сам
 *
 * Экран назывался «Камера», а камеры на нём не было: был переключатель
 * «Текстом / Фото» с текстом по умолчанию, и до съёмки человек добирался
 * через два нажатия и системный выбор файла. Нажатие на вкладку «Камера» —
 * уже выраженное намерение снимать, так что поток запрашивается сразу, а
 * галерея и текст остаются кнопками под кадром.
 *
 * Отказ в доступе не тупик: экран возвращается к прежнему виду с выбором
 * файла и текстом. В Telegram это не редкость — доступ к камере внутри
 * WebView зависит и от платформы, и от версии клиента, — поэтому запасной
 * путь обязан быть полноценным, а не сообщением об ошибке.
 */
export function CameraTab({
  showCalories,
  onSaved,
  inbox,
  onCancelInbox,
  forDay,
}: {
  showCalories: boolean;
  onSaved: () => void;
  /** Снимок из фото-инбокса, если разбор начат оттуда. */
  inbox?: InboxItemDto | null;
  onCancelInbox?: () => void;
  /**
   * День, за который делается запись (ГГГГ-ММ-ДД). Приходит из «Дневника»,
   * когда там открыт не сегодняшний день: раньше запись всё равно ложилась
   * сегодняшним числом, и человек, дописывающий вчерашний ужин, портил
   * себе оба дня сразу. Не задан — сегодня, как и было.
   */
  forDay?: string | null;
}) {
  // Способ ввода. По умолчанию — камера: экран для этого и открывают. Снимок
  // из галереи в этот выбор не входит вовсе — он доступен кнопкой из любого
  // режима и сразу уходит на разбор, отдельного состояния ему не нужно.
  const [mode, setMode] = useState<"camera" | "text">("camera");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  // Последний снимок — для повтора после сетевой ошибки: переснимать кадр или
  // заново лезть в галерею из-за оборвавшегося запроса человек не должен.
  const [lastPhoto, setLastPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DraftItem[] | null>(null);
  const [clarifications, setClarifications] = useState<ClarificationDto[]>([]);
  const [analysis, setAnalysis] = useState<unknown>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [mealType, setMealType] = useState(guessMealType());
  const mainButton = useMainButtonApi();
  const { videoRef, state: cameraState, start: startCamera, stop: stopCamera, shoot } = useCamera();
  // «Как обычно?» — частые приёмы пищи из собственного дневника. Грузим
  // сразу при открытии экрана, в отличие от подсказок «что съесть»: этот
  // запрос не ходит в AI и не тратит квоту, это чтение своих же записей.
  const [frequent, setFrequent] = useState<FrequentMealDto[]>([]);
  // Инбокс-снимок разбирается автоматически один раз при открытии экрана —
  // без этого флага двойной вызов effect'а в dev-режиме отправил бы разбор
  // дважды подряд и упёрся бы в антифлуд-лимит на 3 секунды.
  const autoFiredRef = useRef(false);

  async function handleAnalyze(photo?: File | null) {
    setError(null);
    const formData = new FormData();
    if (inbox) {
      formData.set("mode", "inbox");
      formData.set("inboxId", String(inbox.id));
    } else if (photo) {
      formData.set("mode", "photo");
      formData.set("photo", photo);
    } else {
      if (text.trim().length < 3) { setError("Опишите еду хотя бы парой слов."); return; }
      formData.set("mode", "text");
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

  /**
   * Видоискатель включается сам, как только экран открыт для съёмки.
   *
   * Условия важны все три: у снимка из инбокса кадр уже есть, поверх готового
   * черновика камера не нужна, а в текстовом режиме — тем более. Индикатор
   * камеры, горящий на экране правки граммов, выглядит ровно так, как
   * выглядит, поэтому во всех остальных случаях поток гасится.
   */
  useEffect(() => {
    if (inbox || items || mode !== "camera") { stopCamera(); return; }
    void startCamera();
  }, [inbox, items, mode, startCamera, stopCamera]);

  /** Кадр из потока идёт на разбор тем же путём, что и файл из галереи. */
  async function handleShoot() {
    const file = await shoot();
    if (!file) { setError("Не получилось поймать кадр. Попробуйте ещё раз или выберите снимок."); return; }
    haptic("tap");
    stopCamera();
    analyzePhoto(file);
  }

  /** Общий путь для кадра и файла: предпросмотр и сразу разбор. */
  function analyzePhoto(file: File) {
    setLastPhoto(file);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
    // Мгновенный разбор: снимок сразу уходит на анализ, без отдельного
    // подтверждения («Три отличия от макета», пункт 2, спецификации Mini App v2).
    void handleAnalyze(file);
  }

  // Для снимка из инбокса подсказки не нужны: там уже есть конкретное фото,
  // которое человек пришёл разобрать.
  useEffect(() => {
    if (inbox) return;
    let cancelled = false;
    fetchFrequentMeals()
      .then((result) => { if (!cancelled) setFrequent(result.meals); })
      // Молча: «как обычно» — приятное дополнение, а не то, без чего экран
      // не работает. Ошибку показывать не за что.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [inbox]);

  /** Повтор частого приёма: сразу в черновик, без обращения к разбору. */
  function repeatMeal(meal: FrequentMealDto) {
    haptic("tap");
    setItems(meal.items.map((item) => ({
      name: item.name,
      grams: item.grams,
      suggestedGrams: item.grams,
      kcalPer100: item.kcalPer100,
      proteinPer100: item.proteinPer100,
      fatPer100: item.fatPer100,
      carbsPer100: item.carbsPer100,
      fiberPer100: item.fiberPer100,
      confidence: (item.confidence as Confidence) ?? "high",
    })));
    setClarifications([]);
    // Разбора не было — ни исходного текста, ни снимка, ни JSON-разбора
    // сохранять не надо: запись создаётся из прошлой, а не из новой оценки.
    setAnalysis(null);
    setPhotoKey(null);
    setSourceText(null);
    if (meal.mealType !== "other") setMealType(meal.mealType);
  }

  // Снимок из инбокса: пользователь уже нажал «Разобрать» на предыдущем
  // экране (список инбокса) — здесь разбор просто запускается сам.
  useEffect(() => {
    if (!inbox || items || autoFiredRef.current) return;
    autoFiredRef.current = true;
    void handleAnalyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox?.id]);

  async function handleSave() {
    if (!items || items.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      // Дата записи — по убыванию точности: момент съёмки для снимка из
      // инбокса (снятый в обед и разобранный вечером — всё ещё обед), затем
      // день, открытый в «Дневнике», и только потом сегодня.
      // suggestedGrams — служебное поле только для интерфейса, API его не ждёт.
      await saveMeal({
        inboxId: inbox?.id ?? null,
        eatenOn: inbox?.takenOn ?? forDay ?? now.toLocaleDateString("en-CA"),
        eatenTime: inbox?.takenTime ?? now.toTimeString().slice(0, 5),
        mealType,
        sourceText,
        photoKey,
        analysis,
        items: items.map((item) => ({
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
      onSaved();
    } catch (err) {
      haptic("error");
      setError(err instanceof Error && err.message !== "error" ? err.message : "Не получилось сохранить.");
    } finally {
      setBusy(false);
    }
  }

  // Нативная кнопка Telegram — основное действие текущего шага. В режиме
  // съёмки это спуск затвора: «Разобрать» там нечего, кадра ещё нет.
  useEffect(() => {
    if (busy) return;
    if (items) return mainButton.show("Сохранить", () => void handleSave());
    if (inbox) return;
    if (mode === "text") return mainButton.show("Разобрать", () => void handleAnalyze());
    if (cameraState === "live") return mainButton.show("Снять", () => void handleShoot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, busy, text, mode, mealType, cameraState, inbox?.id]);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current && current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function applyClarification(clarIndex: number, optionIndex: number) {
    haptic("tap");
    const option = clarifications[clarIndex]?.options[optionIndex];
    if (option?.addItem) setItems((current) => (current ? [...current, toDraft(option.addItem!)] : current));
    setClarifications((current) => current.filter((_, i) => i !== clarIndex));
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    analyzePhoto(file);
    // Сбрасываем выбор: иначе повторный выбор того же файла не породит
    // события изменения и кнопка «Из галереи» перестанет работать.
    e.target.value = "";
  }

  if (!items && inbox) {
    return <div className="tg-page">
      <header className="tg-hero">
        <p className="tg-kicker">Из инбокса</p>
        <h1>Снимок за {inbox.takenTime}</h1>
      </header>

      <div className="tg-photo">
        <div className="tg-photo-drop">
          <TgPhoto photoKey={inbox.photoKey} alt="Снимок еды из инбокса" variant="wide" />
        </div>
      </div>
      {inbox.note && <p className="tg-hint">Ваша подпись: «{inbox.note}»</p>}

      {error ? <p className="tg-error">{error}</p> : <p className="tg-hint">Разбираем… обычно это несколько секунд.</p>}

      {/* Кнопка нужна только для повтора после ошибки — при первом заходе разбор уже запущен сам. */}
      {error && <button className="tg-button tg-button-block" onClick={() => void handleAnalyze()} disabled={busy}>
        {busy ? "Разбираем…" : "Разобрать ещё раз"}
      </button>}
      {onCancelInbox &&
        <button className="tg-link-button" onClick={onCancelInbox} disabled={busy}>← В инбокс</button>}
    </div>;
  }

  if (!items) {
    // Снимок уже отправлен — показываем его же вместо видоискателя: человек
    // должен видеть, что именно разбирается, а не живой кадр стола.
    const shot = busy || error ? preview : null;
    return <div className="tg-page tg-camera">
      {/* За какой день делается запись — только когда это не сегодня:
          в обычном случае лишняя строка ничего не добавляет. */}
      {forDay && <p className="tg-kicker">Запись за {formatDayRu(forDay)}</p>}

      {mode === "camera" && <section className="tg-viewfinder" data-state={shot ? "shot" : cameraState}>
        {shot
          // Локальный предпросмотр: это blob сразу с устройства, авторизация
          // ему не нужна и TgPhoto здесь не при чём.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={shot} alt="Снятый кадр" />
          : cameraState === "live"
          ? <>
              {/* Без audio: звук нам не нужен, а разрешение на микрофон пугает. */}
              <video ref={videoRef} playsInline muted />
              {/* Рамка — не украшение: она говорит, куда класть тарелку, и
                  кадры получаются заметно однообразнее, а значит разбор точнее. */}
              <span className="tg-viewfinder-frame" aria-hidden="true" />
              <span className="tg-viewfinder-tip">Наведите на тарелку</span>
              <button className="tg-shutter" aria-label="Снять кадр" disabled={busy}
                onClick={() => void handleShoot()} />
            </>
          : <div className="tg-viewfinder-empty">
              <ArtCamera />
              <p>{cameraState === "starting"
                ? "Включаем камеру…"
                : cameraState === "denied"
                ? "Доступ к камере не дали. Снимок из галереи разбирается точно так же."
                : "Камера здесь недоступна. Выберите снимок из галереи или опишите словами."}</p>
            </div>}
      </section>}

      {mode === "text" && <>
        <h1 className="tg-camera-title">Что вы ели?</h1>
        <textarea className="tg-input" rows={3} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Например: два сырника, ложка сметаны и капучино" />
        {/* Отправка текста требует явного действия; дублируем MainButton в
            интерфейсе, потому что вне Telegram её нет. */}
        <button className="tg-button tg-button-block" onClick={() => void handleAnalyze()} disabled={busy}>
          {busy ? "Разбираем…" : "Разобрать"}
        </button>
      </>}

      {error && <p className="tg-error">{error}</p>}
      {busy && <p className="tg-hint">Разбираем… обычно это несколько секунд.</p>}
      {/* Повтор для снимка — только после ошибки: сам он уходит на разбор
          сразу, отдельного подтверждения не требуя. */}
      {error && lastPhoto && !busy && <button className="tg-button tg-button-block"
        onClick={() => void handleAnalyze(lastPhoto)}>Попробовать снова</button>}

      {/* Прочие способы — под кадром и мельче: главное действие тут съёмка,
          а галерея и текст выручают, когда снять нельзя или уже поздно. */}
      <div className="tg-ways">
        {mode !== "camera" && <button className="tg-way" onClick={() => { haptic("tap"); setMode("camera"); }}>
          Снять камерой
        </button>}
        <label className="tg-way">
          {/* capture="environment" оставлен ради запасного пути: если поток не
              дали, системный выбор на телефоне всё ещё предложит камеру. */}
          <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
          Из галереи
        </label>
        {mode !== "text" && <button className="tg-way" onClick={() => { haptic("tap"); setMode("text"); }}>
          Описать словами
        </button>}
      </div>

      {/* Повтор записанного — самый короткий путь из всех: ни съёмки, ни
          набора текста, ни обращения к модели. Поэтому работает и с
          выключенным разбором, и при исчерпанной квоте. */}
      {frequent.length > 0 && <section className="tg-section tg-usual">
        <h2>Повторить</h2>
        <ul className="tg-usual-list">
          {frequent.map((meal) => <li key={meal.key}>
            <button onClick={() => repeatMeal(meal)}>
              {/* Категорию берём по составу, а не по склеенному заголовку:
                  правило выбора основного блюда одно на все экраны, иначе
                  один и тот же приём пищи получает разные значки. */}
              <FoodIcon category={mealCategory(meal.items.map((item) => item.name))} size="md" />
              <span className="tg-usual-body">
                <b>{meal.title}</b>
                {/* Разовую запись подписываем днём, а не числом повторов:
                    «1 раз за два месяца» — не подсказка, а недоразумение. */}
                <span>{meal.count > 1
                  ? `${withPluralRu(meal.count, ["раз", "раза", "раз"])} за два месяца`
                  : formatDayAgoRu(meal.lastEatenOn)}</span>
              </span>
              <span className="tg-usual-macros">
                {showCalories && <b>{meal.kcal}<i> ккал</i></b>}
                <span>белок {meal.protein} г</span>
              </span>
            </button>
          </li>)}
        </ul>
      </section>}
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

  // Уверенность всего разбора — по худшей позиции: раздел «Три отличия от
  // макета» спецификации Mini App v2, пункт 1. Диапазон и вопрос показываем
  // только там, где она не «высокая»; уверенный разбор — просто число.
  const confidence = overallConfidence(items.map((item) => item.confidence));
  const kcalRange = showCalories ? confidenceRange(totals.kcal, confidence) : null;
  const firstQuestion = clarifications[0]?.question ?? null;

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
          {/* Значок категории — не украшение: в списке из пяти позиций он
              единственное, за что цепляется глаз при беглом просмотре. */}
          <FoodIcon name={item.name} size="sm" />
          <b>{item.name}</b>
          {/* Степпер и множители порций ниже — это и есть «изменить порцию»:
              отдельной кнопки не нужно, редактирование доступно сразу. */}
          <div className="tg-stepper">
            <button aria-label="Меньше" onClick={() => { haptic("tap"); updateItem(index, { grams: Math.max(1, item.grams - 10) }); }}>−</button>
            <span>{item.grams} г</span>
            <button aria-label="Больше" onClick={() => { haptic("tap"); updateItem(index, { grams: Math.min(3000, item.grams + 10) }); }}>+</button>
          </div>
        </div>
        <div className="tg-portions">
          <button type="button" onClick={() => { haptic("tap"); updateItem(index, { grams: scaleGrams(item.grams, 0.5) }); }} aria-label="Уменьшить порцию вдвое">½</button>
          <button type="button" onClick={() => { haptic("tap"); updateItem(index, { grams: scaleGrams(item.grams, 0.75) }); }} aria-label="Уменьшить порцию на четверть">¾</button>
          <button type="button" onClick={() => { haptic("tap"); updateItem(index, { grams: scaleGrams(item.grams, 1.5) }); }} aria-label="Увеличить порцию в полтора раза">1½</button>
          <button type="button" onClick={() => { haptic("tap"); updateItem(index, { grams: scaleGrams(item.grams, 2) }); }} aria-label="Увеличить порцию вдвое">2×</button>
          {item.grams !== item.suggestedGrams && (
            <button type="button" className="tg-portions-reset"
              onClick={() => { haptic("tap"); updateItem(index, { grams: item.suggestedGrams }); }}
              aria-label="Вернуть вес, предложенный моделью">сброс</button>
          )}
        </div>
        <div className="tg-draft-meta">
          {/* Словами, не процентом: модель процента уверенности не сообщает.
              Для «высокой» ничего не показываем — это и есть «просто число». */}
          {item.confidence !== "high" && <i>{CONFIDENCE_LABELS[item.confidence]}</i>}
          {showCalories && <span>{Math.round((item.kcalPer100 * item.grams) / 100)} ккал</span>}
          <span>белок {Math.round((item.proteinPer100 * item.grams) / 10) / 10} г</span>
          <button className="tg-remove" aria-label="Убрать позицию"
            onClick={() => { haptic("tap"); setItems((c) => c && c.filter((_, i) => i !== index)); }}>×</button>
        </div>
      </li>)}
    </ul>

    {/* Разбор мог не заметить гарнир или соус — дописать его здесь дешевле,
        чем переснимать блюдо и тратить ещё один вызов модели. */}
    <AddItem onAdd={(item: NewItem) => setItems((current) => [...(current ?? []), {
      ...item,
      suggestedGrams: item.grams,
      confidence: (item.confidence as Confidence) ?? "medium",
    }])} />

    <div className="tg-card tg-draft-total">
      <div className="tg-draft-total-row">
        {showCalories && <div><strong>{totals.kcal}</strong><span>ккал</span></div>}
        <div><strong>{Math.round(totals.protein * 10) / 10}</strong><span>белок, г</span></div>
        <div><strong>{Math.round(totals.fiber * 10) / 10}</strong><span>клетчатка, г</span></div>
      </div>
      {kcalRange && <p className="tg-draft-total-note">
        Вероятно {kcalRange.min}–{kcalRange.max} ккал ({CONFIDENCE_LABELS[confidence]} уверенность).
        {firstQuestion ? ` ${firstQuestion}` : ""}
      </p>}
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
