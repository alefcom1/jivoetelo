"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { mealItems, meals, users } from "@/db/schema";
import { ANALYSIS_ERRORS, getMealProvider, MealAnalysisError, type MealAnalysis } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { getPendingItem, markProcessed } from "@/lib/inbox";
import { normalizeMealItems, replaceMealItemsForUser, withDishKeys } from "@/lib/meals";
import { checkQuota, quotaMessage, recordUsage } from "@/lib/quota";
import {
  ALLOWED_PHOTO_TYPES,
  deletePhoto,
  MAX_PHOTO_BYTES,
  photoBelongsTo,
  photoMimeType,
  readPhoto,
  savePhoto,
} from "@/lib/storage";

export type AnalyzeResult =
  | { ok: true; analysis: MealAnalysis; photoKey: string | null; sourceText: string | null }
  | { ok: false; error: string };

export async function analyzeMeal(formData: FormData): Promise<AnalyzeResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const mode = String(formData.get("mode") ?? "text");

  // Все функции бесплатны; лимит защищает от неумеренного расхода токенов.
  const operation = mode === "text" ? "analyze_text" : "analyze_photo";
  const decision = await checkQuota(user.id, user.plan, operation);
  if (!decision.allowed) return { ok: false, error: quotaMessage(decision) };
  let photoKey: string | null = null;
  let sourceText: string | null = null;

  try {
    let analysis: MealAnalysis;
    if (mode === "inbox") {
      // Фото уже лежит на диске: его прислали боту раньше. Здесь мы его
      // только читаем — заново загружать и заново класть на диск не нужно.
      const item = await getPendingItem(user.id, Number(formData.get("inboxId")));
      if (!item) return { ok: false, error: "Эта запись уже разобрана или удалена." };

      // Запись голосом: файла нет, в note лежит расшифровка. Разбираем её как
      // обычный текст — тем же разбором, что и описание еды словами.
      if (!item.photoKey) {
        if (!item.note) return { ok: false, error: "В этой записи нечего разбирать." };
        sourceText = item.note;
        const result = await getMealProvider().analyseMeal({ kind: "text", text: item.note });
        analysis = result.analysis;
        await recordUsage(user.id, "analyze_text", result.usage);
      } else {
        const data = await readPhoto(item.photoKey);
        if (!data) return { ok: false, error: "Файл снимка не найден. Попробуйте отклонить его в инбоксе." };

        photoKey = item.photoKey;
        sourceText = item.note;
        const result = await getMealProvider().analyseMeal({
          kind: "photo",
          data,
          mediaType: photoMimeType(item.photoKey) as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          note: item.note ?? undefined,
          photoKey: item.photoKey,
        });
        analysis = result.analysis;
        await recordUsage(user.id, operation, result.usage);
      }
    } else if (mode === "photo") {
      const file = formData.get("photo");
      if (!(file instanceof File) || file.size === 0) {
        return { ok: false, error: "Выберите фото." };
      }
      if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        return { ok: false, error: "Поддерживаются фото в форматах JPEG, PNG, WebP и GIF." };
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return { ok: false, error: "Фото больше 8 МБ — сделайте снимок поменьше." };
      }
      const data = Buffer.from(await file.arrayBuffer());
      photoKey = await savePhoto(user.id, data, file.type);
      const note = String(formData.get("note") ?? "").trim().slice(0, 300) || undefined;
      sourceText = note ?? null;
      const result = await getMealProvider().analyseMeal({
        kind: "photo",
        data,
        mediaType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        note,
        photoKey,
      });
      analysis = result.analysis;
      await recordUsage(user.id, operation, result.usage);
    } else {
      const text = String(formData.get("text") ?? "").trim();
      if (text.length < 3) return { ok: false, error: "Опишите еду хотя бы парой слов." };
      sourceText = text.slice(0, 1000);
      const result = await getMealProvider().analyseMeal({ kind: "text", text: sourceText });
      analysis = result.analysis;
      await recordUsage(user.id, operation, result.usage);
    }
    return { ok: true, analysis, photoKey, sourceText };
  } catch (error) {
    // Снимок из инбокса не удаляем: он попал на диск не в этом вызове и
    // должен остаться в инбоксе, чтобы разбор можно было повторить.
    if (photoKey && mode !== "inbox") await deletePhoto(photoKey).catch(() => {});
    if (error instanceof MealAnalysisError) {
      return { ok: false, error: ANALYSIS_ERRORS[error.reason] };
    }
    console.error("analyzeMeal failed", error);
    return { ok: false, error: ANALYSIS_ERRORS.provider_error };
  }
}

export type SaveMealInput = {
  eatenOn: string;
  eatenTime: string;
  mealType: string;
  sourceText: string | null;
  photoKey: string | null;
  analysis: MealAnalysis | null;
  /** Запись фото-инбокса, из которой вырос приём пищи, если он оттуда. */
  inboxId?: number | null;
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

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "other"];

function clamp(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export async function saveMeal(input: SaveMealInput): Promise<{ ok: false; error: string } | never> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const eatenOn = /^\d{4}-\d{2}-\d{2}$/.test(input.eatenOn) ? input.eatenOn : null;
  const eatenTime = /^\d{2}:\d{2}$/.test(input.eatenTime) ? input.eatenTime : null;
  if (!eatenOn || !eatenTime) return { ok: false, error: "Проверьте дату и время." };

  const items = (Array.isArray(input.items) ? input.items : [])
    .map((item) => ({
      name: String(item.name ?? "").trim().slice(0, 120),
      grams: clamp(item.grams, 1, 3000),
      kcalPer100: clamp(item.kcalPer100, 0, 900),
      proteinPer100: clamp(item.proteinPer100, 0, 100),
      fatPer100: clamp(item.fatPer100, 0, 100),
      carbsPer100: clamp(item.carbsPer100, 0, 100),
      fiberPer100: clamp(item.fiberPer100, 0, 50),
      confidence: ["high", "medium", "low"].includes(item.confidence) ? item.confidence : "medium",
    }))
    .filter((item) => item.name.length > 0)
    .slice(0, 30);
  if (items.length === 0) return { ok: false, error: "Добавьте хотя бы одну позицию." };

  const photoKey = input.photoKey && photoBelongsTo(input.photoKey, user.id) ? input.photoKey : null;

  try {
    const db = getDb();
    const inserted = await db
      .insert(meals)
      .values({
        userId: user.id,
        eatenOn,
        eatenTime,
        mealType: MEAL_TYPES.includes(input.mealType) ? input.mealType : "other",
        sourceText: input.sourceText?.slice(0, 1000) ?? null,
        photoKey,
        analysis: input.analysis ?? null,
      })
      .returning({ id: meals.id });
    await db.insert(mealItems).values(withDishKeys(items).map((item) => ({ ...item, mealId: inserted[0].id })));
    // Снимок уходит из инбокса только теперь, когда приём пищи действительно
    // сохранён: до этого момента разбор можно было бросить на полпути.
    if (input.inboxId) await markProcessed(user.id, input.inboxId, inserted[0].id);
  } catch (error) {
    console.error("saveMeal failed", error);
    return { ok: false, error: "Не получилось сохранить. Попробуйте ещё раз." };
  }
  redirect(`/app?date=${eatenOn}&saved=meal`);
}

/**
 * Правка уже сохранённой записи из кабинета: состав, вес, КБЖУ на 100 г, тип
 * приёма и время.
 *
 * Раньше в кабинете этого не было вовсе — только «Удалить запись». Разбор по
 * фото иногда ошибается (в том числе выдаёт позицию с нулевой калорийностью),
 * и единственным способом исправить одну цифру было удалить приём пищи
 * целиком и завести заново, потратив ещё один разбор. В Mini App правка была,
 * в вебе — нет; расхождение чинится здесь.
 *
 * Числа проходят через ту же `normalizeMealItems`, что и запись из Telegram:
 * значения с клиента недоверенные, и правила обрезки должны быть одни на оба
 * клиента, иначе через веб в базу попадёт то, что через бот не попадает.
 */
export async function updateMealItems(input: {
  mealId: number;
  mealType: string;
  eatenTime: string;
  items: unknown;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = normalizeMealItems(input.items);
  if (items.length === 0) return { ok: false, error: "Добавьте хотя бы одну позицию." };

  try {
    const updated = await replaceMealItemsForUser(user.id, input.mealId, input.mealType, items, input.eatenTime);
    if (!updated) return { ok: false, error: "Запись не найдена." };
  } catch (error) {
    console.error("updateMealItems failed", error);
    return { ok: false, error: "Не получилось сохранить. Попробуйте ещё раз." };
  }

  revalidatePath(`/app/meals/${input.mealId}`);
  revalidatePath("/app");
  return { ok: true };
}

export async function deleteMeal(mealId: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await getDb()
    .select({ id: meals.id, photoKey: meals.photoKey, eatenOn: meals.eatenOn })
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, user.id)))
    .limit(1);
  const meal = rows[0];
  if (!meal) redirect("/app");

  await getDb().delete(meals).where(eq(meals.id, meal.id));
  if (meal.photoKey) await deletePhoto(meal.photoKey).catch(() => {});
  redirect(`/app?date=${meal.eatenOn}`);
}

/** Удаляет фото приёма пищи, сохраняя записанные данные (раздел 8.14 спеки). */
export async function deleteMealPhoto(mealId: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await getDb()
    .select({ id: meals.id, photoKey: meals.photoKey })
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, user.id)))
    .limit(1);
  const meal = rows[0];
  if (meal?.photoKey) {
    await deletePhoto(meal.photoKey).catch(() => {});
    await getDb().update(meals).set({ photoKey: null }).where(eq(meals.id, meal.id));
  }
  revalidatePath(`/app/meals/${mealId}`);
}

export async function setShowCalories(show: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await getDb().update(users).set({ showCalories: show }).where(eq(users.id, user.id));
  revalidatePath("/app");
  revalidatePath("/app/settings");
}
