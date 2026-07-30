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
export type TgMeal = { id: number; time: string; title: string; items: string[]; kcal: number; protein: number };

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
  return handle<TodayResponse>(await fetch("/api/tg/today", { headers: initDataHeader(), cache: "no-store" }));
}

export async function linkAccount(code: string): Promise<{ ok: true; email: string }> {
  const response = await fetch("/api/tg/link", {
    method: "POST",
    headers: { ...initDataHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return handle<{ ok: true; email: string }>(response);
}

export async function analyzeMeal(formData: FormData): Promise<{
  analysis: { mealType: string; items: AnalysisItemDto[]; clarifications: ClarificationDto[] };
  photoKey: string | null;
  sourceText: string | null;
}> {
  const response = await fetch("/api/tg/analyze", { method: "POST", headers: initDataHeader(), body: formData });
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
  const response = await fetch("/api/tg/meals", {
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
  return handle<{ items: InboxItemDto[] }>(await fetch("/api/tg/inbox", { headers: initDataHeader(), cache: "no-store" }));
}

export async function dismissInboxItem(id: number): Promise<{ ok: boolean }> {
  const response = await fetch("/api/tg/inbox", {
    method: "POST",
    headers: { ...initDataHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return handle<{ ok: boolean }>(response);
}

export type SuggestResponse = {
  needsPlan: boolean;
  context?: { remainingKcal: number; remainingProtein: number; remainingFiber: number; mealTypeLabel: string };
  suggestions: Array<{ title: string; why: string; approxKcal: number; approxProtein: number; timeMinutes: number }>;
};

export async function fetchSuggestions(): Promise<SuggestResponse> {
  return handle<SuggestResponse>(await fetch("/api/tg/suggest", { headers: initDataHeader(), cache: "no-store" }));
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
