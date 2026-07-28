// Общий слой дневника: используется и веб-приложением, и Telegram Mini App,
// чтобы бизнес-правила жили в одном месте (один бэкенд для обеих платформ).

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals, profiles } from "@/db/schema";
import { sumTotals, type NutritionTotals } from "./nutrition.ts";
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
