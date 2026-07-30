"use client";

// Отдельный клиент для экрана «Дневник» — тот же приём, что и в
// app/tg/plan-profile-api.ts: свой файл на крупный экран со своими типами,
// а не расширение общего app/tg/api.ts. Несколько строк авторизации ниже
// дублируют остальные api-модули сознательно, по той же причине, что там
// описана.

import { getWebApp } from "./telegram.ts";

function initDataHeader(): Record<string, string> {
  const initData = getWebApp()?.initData ?? "";
  return { "x-telegram-init-data": initData };
}

export class DiaryApiError extends Error {
  readonly reason: string;
  constructor(reason: string, message?: string) {
    super(message ?? reason);
    this.reason = reason;
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
  const reason = typeof payload.reason === "string" ? payload.reason : "error";
  const message = typeof payload.error === "string" ? payload.error : undefined;
  throw new DiaryApiError(reason, message);
}

export type DiaryTargets = {
  kcalTarget: number;
  kcalMin: number;
  kcalMax: number;
  proteinTarget: number;
  fiberTarget: number;
  fatTarget: number;
  carbsTarget: number;
};

export type DiaryTotals = { kcal: number; protein: number; fat: number; carbs: number; fiber: number };

export type DiaryMeal = {
  id: number;
  time: string;
  mealType: string;
  typeLabel: string;
  photoKey: string | null;
  itemsPreview: string;
  itemCount: number;
  totals: DiaryTotals;
};

export type DiaryDayResponse = {
  day: string;
  isToday: boolean;
  showCalories: boolean;
  totals: DiaryTotals;
  targets: DiaryTargets | null;
  meals: DiaryMeal[];
};

export async function fetchDiaryDay(day: string): Promise<DiaryDayResponse> {
  return handle<DiaryDayResponse>(
    await fetch(`/api/tg/diary?day=${encodeURIComponent(day)}`, { headers: initDataHeader(), cache: "no-store" }),
  );
}

export type DiaryMealItem = {
  id: number;
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  confidence: string;
};

export type MealDetail = {
  id: number;
  eatenOn: string;
  eatenTime: string;
  mealType: string;
  sourceText: string | null;
  photoKey: string | null;
  items: DiaryMealItem[];
};

export async function fetchMealDetail(id: number): Promise<MealDetail> {
  return handle<MealDetail>(await fetch(`/api/tg/meals/${id}`, { headers: initDataHeader(), cache: "no-store" }));
}

export async function updateMeal(
  id: number,
  payload: { mealType: string; items: Array<Omit<DiaryMealItem, "id">> },
): Promise<{ ok: true }> {
  return handle(await fetch(`/api/tg/meals/${id}`, {
    method: "PATCH",
    headers: { ...initDataHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

export async function deleteMeal(id: number): Promise<{ ok: true }> {
  return handle(await fetch(`/api/tg/meals/${id}`, { method: "DELETE", headers: initDataHeader() }));
}
