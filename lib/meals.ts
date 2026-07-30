// Общий слой дневника: используется и веб-приложением, и Telegram Mini App,
// чтобы бизнес-правила жили в одном месте (один бэкенд для обеих платформ).

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals, profiles } from "@/db/schema";
import type { DiaryItemRow, DiaryMealRow } from "./diary.ts";
import { sumTotals, type NutritionTotals } from "./nutrition.ts";
import type { PaceKey } from "./pace.ts";
import { deletePhoto } from "./storage.ts";
import { computeTargets, type Activity, type Goal, type SexForFormula, type Targets } from "./targets.ts";
import { getLatestWeightKg } from "./weight.ts";

export type DayMeal = {
  id: number;
  eatenTime: string;
  mealType: string;
  itemNames: string[];
  totals: NutritionTotals;
};

export type DaySummary = {
  day: string;
  totals: NutritionTotals;
  meals: DayMeal[];
  targets: Targets | null;
};

/** Итоги дня и список приёмов пищи — источник данных для «Сегодня». */
export async function getDaySummary(userId: number, day: string): Promise<DaySummary> {
  const db = getDb();
  const dayMeals = await db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.eatenOn, day)))
    .orderBy(meals.eatenTime);

  const ids = dayMeals.map((m) => m.id);
  const items = ids.length > 0 ? await db.select().from(mealItems).where(inArray(mealItems.mealId, ids)) : [];
  const itemsByMeal = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemsByMeal.get(item.mealId) ?? [];
    list.push(item);
    itemsByMeal.set(item.mealId, list);
  }

  return {
    day,
    totals: sumTotals(items),
    meals: dayMeals.map((meal) => {
      const mealItemList = itemsByMeal.get(meal.id) ?? [];
      return {
        id: meal.id,
        eatenTime: meal.eatenTime,
        mealType: meal.mealType,
        itemNames: mealItemList.map((i) => i.name),
        totals: sumTotals(mealItemList),
      };
    }),
    targets: await getTargetsForUser(userId),
  };
}

/** Актуальные цели пользователя или null, если план ещё не настроен. */
export async function getTargetsForUser(userId: number): Promise<Targets | null> {
  const rows = await getDb().select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const profile = rows[0];
  if (!profile) return null;
  const weightKg = await getLatestWeightKg(userId);
  if (!weightKg) return null;

  return computeTargets({
    goal: profile.goal as Goal,
    sexForFormula: profile.sexForFormula as SexForFormula,
    birthYear: profile.birthYear,
    heightCm: profile.heightCm,
    weightKg,
    activity: profile.activity as Activity,
    adjustmentKcal: profile.kcalAdjustment,
    pace: profile.pace as PaceKey | null,
  });
}

export type SaveMealItem = {
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  confidence: string;
};

export type SaveMealInput = {
  userId: number;
  eatenOn: string;
  eatenTime: string;
  mealType: string;
  sourceText: string | null;
  photoKey: string | null;
  analysis: unknown;
  items: SaveMealItem[];
};

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "other"];

function clamp(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Нормализует позиции приёма пищи: клиентские значения недоверенные. */
export function normalizeMealItems(rawItems: unknown): SaveMealItem[] {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((raw): SaveMealItem => {
      const item = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
      return {
        name: String(item.name ?? "").trim().slice(0, 120),
        grams: clamp(item.grams, 1, 3000),
        kcalPer100: clamp(item.kcalPer100, 0, 900),
        proteinPer100: clamp(item.proteinPer100, 0, 100),
        fatPer100: clamp(item.fatPer100, 0, 100),
        carbsPer100: clamp(item.carbsPer100, 0, 100),
        fiberPer100: clamp(item.fiberPer100, 0, 50),
        confidence: ["high", "medium", "low"].includes(String(item.confidence)) ? String(item.confidence) : "medium",
      };
    })
    .filter((item) => item.name.length > 0)
    .slice(0, 30);
}

/** Сохраняет приём пищи. Возвращает id созданной записи. */
export async function saveMeal(input: SaveMealInput): Promise<number> {
  const db = getDb();
  const inserted = await db
    .insert(meals)
    .values({
      userId: input.userId,
      eatenOn: input.eatenOn,
      eatenTime: input.eatenTime,
      mealType: MEAL_TYPES.includes(input.mealType) ? input.mealType : "other",
      sourceText: input.sourceText?.slice(0, 1000) ?? null,
      photoKey: input.photoKey,
      analysis: input.analysis ?? null,
    })
    .returning({ id: meals.id });

  const mealId = inserted[0].id;
  await db.insert(mealItems).values(input.items.map((item) => ({ ...item, mealId })));
  return mealId;
}

/**
 * Сырые строки одного дня для экрана «Дневник»: группировка по приёму пищи
 * и подсчёт итогов — в lib/diary.ts (чистая логика, покрыта тестами), здесь
 * только чтение из базы. Разделение то же, что у getDaySummary выше, но
 * с дополнительными полями (photoKey у приёма, per-100г у позиций), которые
 * «Сегодня» не показывает, а «Дневник» — показывает.
 */
export async function getDiaryDayRows(userId: number, day: string): Promise<{ meals: DiaryMealRow[]; items: DiaryItemRow[] }> {
  const db = getDb();
  const dayMeals = await db
    .select({ id: meals.id, eatenTime: meals.eatenTime, mealType: meals.mealType, photoKey: meals.photoKey })
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.eatenOn, day)))
    .orderBy(meals.eatenTime);

  const ids = dayMeals.map((m) => m.id);
  const items = ids.length > 0
    ? await db
        .select({
          mealId: mealItems.mealId,
          name: mealItems.name,
          grams: mealItems.grams,
          kcalPer100: mealItems.kcalPer100,
          proteinPer100: mealItems.proteinPer100,
          fatPer100: mealItems.fatPer100,
          carbsPer100: mealItems.carbsPer100,
          fiberPer100: mealItems.fiberPer100,
        })
        .from(mealItems)
        .where(inArray(mealItems.mealId, ids))
    : [];

  return { meals: dayMeals, items };
}

export type MealDetail = {
  id: number;
  eatenOn: string;
  eatenTime: string;
  mealType: string;
  sourceText: string | null;
  photoKey: string | null;
  items: Array<{
    id: number;
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

/** Приём пищи целиком, с проверкой владельца прямо в запросе — для экрана правки в «Дневнике». */
export async function getMealDetailForUser(userId: number, mealId: number): Promise<MealDetail | null> {
  const db = getDb();
  const rows = await db.select().from(meals).where(and(eq(meals.id, mealId), eq(meals.userId, userId))).limit(1);
  const meal = rows[0];
  if (!meal) return null;

  const items = await db.select().from(mealItems).where(eq(mealItems.mealId, meal.id));
  return {
    id: meal.id,
    eatenOn: meal.eatenOn,
    eatenTime: meal.eatenTime,
    mealType: meal.mealType,
    sourceText: meal.sourceText,
    photoKey: meal.photoKey,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      grams: item.grams,
      kcalPer100: item.kcalPer100,
      proteinPer100: item.proteinPer100,
      fatPer100: item.fatPer100,
      carbsPer100: item.carbsPer100,
      fiberPer100: item.fiberPer100,
      confidence: item.confidence,
    })),
  };
}

/**
 * Правка порции и состава (экран «Дневник»): старые позиции удаляются, новые
 * вставляются заново — тот же приём, что и при первом сохранении, только на
 * месте уже существующей записи `meals`. Без транзакции — как и остальной
 * код этого файла (saveMeal выше тоже пишет двумя запросами подряд без неё):
 * для пары delete/insert в одном обработчике риск рассинхронизации ничтожен,
 * а транзакция потребовала бы отдельно прокидывать соединение через getDb().
 * Возвращает false, если записи не было или она принадлежит другому пользователю.
 */
export async function replaceMealItemsForUser(
  userId: number,
  mealId: number,
  mealType: string,
  items: SaveMealItem[],
): Promise<boolean> {
  const db = getDb();
  const owned = await db.select({ id: meals.id }).from(meals).where(and(eq(meals.id, mealId), eq(meals.userId, userId))).limit(1);
  if (!owned[0]) return false;

  await db.delete(mealItems).where(eq(mealItems.mealId, mealId));
  await db.insert(mealItems).values(items.map((item) => ({ ...item, mealId })));
  await db.update(meals).set({ mealType: MEAL_TYPES.includes(mealType) ? mealType : "other" }).where(eq(meals.id, mealId));
  return true;
}

/**
 * Удаляет приём пищи целиком вместе с фото, если оно было (тот же порядок,
 * что в app/app/meal-actions.ts на вебе: сначала строка из базы, потом файл —
 * лучше осиротевший файл на диске, чем запись в БД без данных под ней).
 * Возвращает false, если записи не было или она принадлежит другому пользователю.
 */
export async function deleteMealForUser(userId: number, mealId: number): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: meals.id, photoKey: meals.photoKey })
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
    .limit(1);
  const meal = rows[0];
  if (!meal) return false;

  await db.delete(meals).where(eq(meals.id, meal.id));
  if (meal.photoKey) await deletePhoto(meal.photoKey).catch(() => {});
  return true;
}
