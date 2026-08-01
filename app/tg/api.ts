"use client";

import { getWebApp } from "./telegram.ts";

export type TgTotals = { kcal: number; protein: number; fat: number; carbs: number; fiber: number };
export type TgTargets = {
  kcalTarget: number;
  kcalMin: number;
  kcalMax: number;
  proteinTarget: number;
  fiberTarget: number;
  // Выводятся из kcalTarget/proteinTarget на сервере (lib/macro-split.ts) —
  // отдельной целью в БД не хранятся.
  fatTarget: number;
  carbsTarget: number;
};
export type TgMeal = {
  id: number;
  time: string;
  title: string;
  items: string[];
  /** Снимок приёма пищи или null, если еду вводили текстом. */
  photoKey: string | null;
  kcal: number;
  protein: number;
};

/** Точка тренда веса — тот же формат, что и в вебе (lib/trend.ts). */
export type TgWeightPoint = { onDate: string; weightKg: number; trendKg: number };
export type TgWeight = { entries: TgWeightPoint[]; weeklyChangeKg: number | null };

export type TodayResponse = {
  showCalories: boolean;
  day: string;
  totals: TgTotals;
  targets: TgTargets | null;
  meals: TgMeal[];
  /** Снимки, присланные боту и ещё не подтверждённые — строка на «Сегодня». */
  inboxPending: number;
  weight: TgWeight | null;
};

export type ApiFailure = { reason: "not_linked" | "invalid_signature" | "not_configured" | "error"; message?: string };

export class ApiError extends Error {
  readonly failure: ApiFailure;
  constructor(failure: ApiFailure) {
    super(failure.message ?? failure.reason);
    this.failure = failure;
  }
}

function initDataHeader(): Record<string, string> {
  const initData = getWebApp()?.initData ?? "";
  return { "x-telegram-init-data": initData };
}

/**
 * Предел ожидания ответа.
 *
 * ## Почему он вообще нужен
 *
 * Без него запрос висит, пока его не убьёт операционная система, — на iPhone
 * это оказалось около трёх минут. Всё это время кнопка говорит «Разбираем…»,
 * и человек не может ни отменить, ни повторить: экран выглядит зависшим,
 * потому что он и есть зависший.
 *
 * Значение с большим запасом: разбор текста укладывается в секунды, снимок —
 * в десяток. Полторы минуты означают, что что-то сломалось, и честнее это
 * сказать, чем ждать дальше.
 */
const ANALYZE_TIMEOUT_MS = 90_000;
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Ошибки сети — своими словами.
 *
 * `fetch` в WKWebView бросает `TypeError: Load failed`, в Chrome — `Failed to
 * fetch`. Эти строки однажды доехали до экрана как есть: человек увидел
 * «Load failed» посреди русского интерфейса. Своё сообщение не объясняет
 * больше, но хотя бы говорит, что делать.
 */
function networkFailure(cause: unknown): ApiError {
  if (cause instanceof DOMException && cause.name === "TimeoutError") {
    return new ApiError({ reason: "error", message: "Слишком долго нет ответа. Попробуйте ещё раз." });
  }
  if (cause instanceof DOMException && cause.name === "AbortError") {
    return new ApiError({ reason: "error", message: "Запрос отменён." });
  }
  return new ApiError({ reason: "error", message: "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз." });
}

/**
 * Запрос с ограничением по времени и с человеческим текстом ошибки.
 *
 * `ApiError` пропускаем наружу как есть: это уже разобранный ответ сервера
 * с осмысленным сообщением, и подменять его на «нет связи» было бы враньём.
 */
async function request(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (cause) {
    throw networkFailure(cause);
  }
}

async function handle<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json();
  } catch {
    // тело может быть пустым — тогда опираемся на статус
  }
  const reason = payload.reason;
  if (reason === "not_linked" || reason === "invalid_signature" || reason === "not_configured") {
    throw new ApiError({ reason });
  }
  throw new ApiError({ reason: "error", message: typeof payload.error === "string" ? payload.error : undefined });
}

export async function fetchToday(): Promise<TodayResponse> {
  return handle<TodayResponse>(await request("/api/tg/today", { headers: initDataHeader(), cache: "no-store" }));
}

export async function linkAccount(code: string): Promise<{ ok: true; email: string }> {
  const response = await request("/api/tg/link", {
    method: "POST",
    headers: { ...initDataHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return handle<{ ok: true; email: string }>(response);
}

/**
 * Заводит аккаунт по подписи Telegram — без почты и пароля.
 *
 * `consent` уходит на сервер и проверяется там же: галочка в интерфейсе
 * защищает от случайного нажатия, но не от запроса, посланного мимо него.
 */
export async function registerByTelegram(consent: boolean): Promise<{ ok: true; created: boolean }> {
  const response = await request("/api/tg/register", {
    method: "POST",
    headers: { ...initDataHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ consent }),
  });
  return handle<{ ok: true; created: boolean }>(response);
}

export async function analyzeMeal(formData: FormData): Promise<{
  analysis: { mealType: string; items: AnalysisItemDto[]; clarifications: ClarificationDto[] };
  photoKey: string | null;
  sourceText: string | null;
}> {
  // Разбор — единственный запрос, который законно идёт долго: на том конце
  // модель. Остальным хватает общего предела.
  const response = await request(
    "/api/tg/analyze",
    { method: "POST", headers: initDataHeader(), body: formData },
    ANALYZE_TIMEOUT_MS,
  );
  return handle(response);
}

export type AnalysisItemDto = {
  name: string;
  estimatedGrams: number;
  confidence: string;
  per100g: { kcal: number; protein: number; fat: number; carbs: number; fiber: number };
};

export type ClarificationDto = {
  question: string;
  options: Array<{ label: string; addItem?: AnalysisItemDto }>;
};

export async function saveMeal(payload: unknown): Promise<{ ok: true; id: number }> {
  const response = await request("/api/tg/meals", {
    method: "POST",
    headers: { ...initDataHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<{ ok: true; id: number }>(response);
}

export type InboxItemDto = {
  id: number;
  photoKey: string;
  note: string | null;
  takenOn: string;
  takenTime: string;
};

export async function fetchInbox(): Promise<{ items: InboxItemDto[] }> {
  return handle<{ items: InboxItemDto[] }>(await request("/api/tg/inbox", { headers: initDataHeader(), cache: "no-store" }));
}

export async function dismissInboxItem(id: number): Promise<{ ok: boolean }> {
  const response = await request("/api/tg/inbox", {
    method: "POST",
    headers: { ...initDataHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return handle<{ ok: boolean }>(response);
}

/** Частый приём пищи для повтора — «как обычно?» на «Камере». */
export type FrequentMealDto = {
  key: string;
  title: string;
  mealType: string;
  /** Сколько раз этот состав встречался. 1 — просто недавняя запись. */
  count: number;
  lastEatenOn: string;
  kcal: number;
  protein: number;
  items: Array<{
    name: string;
    grams: number;
    kcalPer100: number;
    proteinPer100: number;
    fatPer100: number;
    carbsPer100: number;
    fiberPer100: number;
    confidence: string;
  }>;
};

export async function fetchFrequentMeals(): Promise<{ meals: FrequentMealDto[] }> {
  return handle<{ meals: FrequentMealDto[] }>(
    await request("/api/tg/frequent", { headers: initDataHeader(), cache: "no-store" }),
  );
}

export type SuggestResponse = {
  needsPlan: boolean;
  context?: { remainingKcal: number; remainingProtein: number; remainingFiber: number; mealTypeLabel: string };
  suggestions: Array<{ title: string; why: string; approxKcal: number; approxProtein: number; timeMinutes: number }>;
};

export async function fetchSuggestions(): Promise<SuggestResponse> {
  return handle<SuggestResponse>(await request("/api/tg/suggest", { headers: initDataHeader(), cache: "no-store" }));
}

/**
 * Скачивает снимок еды как Blob тем же initData-заголовком, что и остальные
 * запросы Mini App. Обычный <img src="/api/photos/..."> здесь не работает —
 * WebView не хранит cookie веб-сессии, а подпись Telegram нельзя класть в
 * query строки картинки: она осела бы в логах сервера, в Referer и в истории
 * браузера. Поэтому фото качает fetch, а <img> получает уже objectURL —
 * см. app/tg/photo.tsx.
 */
export async function fetchPhoto(key: string): Promise<Blob> {
  const response = await fetch(`/api/tg/photo/${key}`, { headers: initDataHeader(), cache: "no-store" });
  if (!response.ok) throw new ApiError({ reason: "error" });
  return response.blob();
}
