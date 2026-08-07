"use client";

// Отдельный клиент для экранов «План» и «Профиль». Не расширяем общий
// app/tg/api.ts: тот же файл параллельно правит другой агент (оболочка,
// «Сегодня», «Камера»), и общий файл гарантированно дал бы конфликт слияния.
// Несколько строк авторизации ниже дублируют app/tg/api.ts сознательно —
// это дешевле, чем совместное редактирование одного файла двумя агентами.

import type { PlanData } from "@/lib/plan";
import type { ProfileData } from "@/lib/profile";
import type { ReviewData } from "@/lib/review-data";
import { getWebApp } from "./telegram.ts";

export class PlanProfileApiError extends Error {
  readonly reason: string;
  constructor(reason: string, message?: string) {
    super(message ?? reason);
    this.reason = reason;
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
  const reason = typeof payload.reason === "string" ? payload.reason : "error";
  const message = typeof payload.error === "string" ? payload.error : undefined;
  throw new PlanProfileApiError(reason, message);
}

// Оба типа на сервере уже хранят даты как строки (не Date), поэтому JSON
// после Response.json() соответствует им один в один — переиспользуем как есть.
export type PlanResponse = PlanData;
export type ProfileResponse = ProfileData;
export type ReviewResponse = ReviewData;

export async function fetchPlan(): Promise<PlanResponse> {
  return handle<PlanResponse>(await fetch("/api/tg/plan", { headers: initDataHeader(), cache: "no-store" }));
}

export async function fetchReview(): Promise<ReviewResponse> {
  return handle<ReviewResponse>(await fetch("/api/tg/review", { headers: initDataHeader(), cache: "no-store" }));
}

/** Подтвердить предложенную поправку. Величину считает сервер — отсюда не шлём. */
export async function applyPlanProposal(): Promise<{ ok: true; applied: number | null }> {
  return handle(await fetch("/api/tg/review", { method: "POST", headers: initDataHeader() }));
}

export async function fetchProfile(): Promise<ProfileResponse> {
  return handle<ProfileResponse>(await fetch("/api/tg/profile", { headers: initDataHeader(), cache: "no-store" }));
}

export async function saveGoals(payload: {
  goal: string;
  activity: string;
  heightCm: number;
  targetWeightKg: number | null;
  pace: string | null;
  kcalOverride: number | null;
}): Promise<{ ok: true }> {
  return handle(await fetch("/api/tg/profile/goals", {
    method: "POST",
    headers: { ...initDataHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

export async function addMeasurement(weightKg: number): Promise<{ ok: true }> {
  return handle(await fetch("/api/tg/profile/weight", {
    method: "POST",
    headers: { ...initDataHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ weightKg }),
  }));
}

/**
 * Ответ распознавания весов. `ok: false` — не сбой, а нормальный исход:
 * индикатор не разобрать, и человеку возвращается совет, а не ошибка.
 */
export type ScaleScanResponse =
  | { ok: true; weightKg: number; warning: string | null }
  | { ok: false; message: string };

/** Прочитать показания весов со снимка. Замер не сохраняется — только читает. */
export async function scanScale(photo: File): Promise<ScaleScanResponse> {
  const body = new FormData();
  body.set("photo", photo);
  // Заголовок с подписью ставится вручную, Content-Type — нет: границу
  // multipart проставляет браузер, и заданный руками тип её потеряет.
  return handle(await fetch("/api/tg/profile/weight/scan", {
    method: "POST",
    headers: initDataHeader(),
    body,
  }));
}

export async function saveReminders(payload: {
  remindersEnabled: boolean;
  digestHour: number;
  weighRemindersEnabled: boolean;
}): Promise<{ ok: true }> {
  return handle(await fetch("/api/tg/profile/reminders", {
    method: "POST",
    headers: { ...initDataHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save", ...payload }),
  }));
}

export async function snoozeReminders(): Promise<{ ok: true }> {
  return handle(await fetch("/api/tg/profile/reminders", {
    method: "POST",
    headers: { ...initDataHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ action: "snooze" }),
  }));
}

export async function unlinkTelegram(): Promise<{ ok: true }> {
  return handle(await fetch("/api/tg/unlink", { method: "POST", headers: initDataHeader() }));
}

/** Текст приглашения с личной ссылкой. `award` — если делятся наградой. */
export async function fetchShareText(award?: string): Promise<{ text: string; invited: number }> {
  return handle(await fetch("/api/tg/share", {
    method: "POST",
    headers: { ...initDataHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(award ? { award } : {}),
  }));
}
