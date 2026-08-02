import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals, profiles, weightEntries } from "@/db/schema";
import { localToday, shiftDay } from "@/lib/dates";
import { sumTotals } from "@/lib/nutrition";
import { proposeAdjustment, type AdjustmentProposal } from "@/lib/adaptive";
import { computeMealStats, type PeriodStats } from "@/lib/meal-stats";
import type { PaceKey } from "@/lib/pace";
import { buildWeekReview, type DayStat, type WeekReview } from "@/lib/review";
import { computeTargets, type Activity, type Goal, type SexForFormula, type Targets } from "@/lib/targets";
import { weeklyTrendChange, weightTrend } from "@/lib/trend";

export type ReviewData = {
  review: WeekReview;
  targets: Targets | null;
  proposal: AdjustmentProposal | null;
  weekStart: string;
  weekEnd: string;
  /** Счётчики приёмов пищи за ту же неделю — те же числа, что на «Плане». */
  mealStats: PeriodStats;
};

/** Собирает данные недельного обзора за последние 7 дней (включая сегодня). */
export async function getReviewData(userId: number, showCalories: boolean): Promise<ReviewData> {
  const db = getDb();
  const weekEnd = localToday();
  const weekStart = shiftDay(weekEnd, -6);

  const weekMeals = await db
    .select({ id: meals.id, eatenOn: meals.eatenOn, eatenTime: meals.eatenTime, mealType: meals.mealType })
    .from(meals)
    .where(and(eq(meals.userId, userId), gte(meals.eatenOn, weekStart)));
  // Окно уже ограничено неделей запросом выше, поэтому началом истории здесь
  // служит сам weekStart: обзор и так называется недельным.
  const mealStats = computeMealStats(weekMeals, weekEnd, weekStart).week;
  const mealIds = weekMeals.map((m) => m.id);
  const items = mealIds.length > 0 ? await db.select().from(mealItems).where(inArray(mealItems.mealId, mealIds)) : [];

  const dayByMeal = new Map(weekMeals.map((m) => [m.id, m.eatenOn]));
  const itemsByDay = new Map<string, typeof items>();
  for (const item of items) {
    const day = dayByMeal.get(item.mealId);
    if (!day) continue;
    const list = itemsByDay.get(day) ?? [];
    list.push(item);
    itemsByDay.set(day, list);
  }
  const dayStats: DayStat[] = [...itemsByDay.entries()].map(([day, dayItems]) => {
    const totals = sumTotals(dayItems);
    return { day, kcal: totals.kcal, protein: totals.protein, fiber: totals.fiber };
  });

  const entries = await db
    .select({ onDate: weightEntries.onDate, weightKg: weightEntries.weightKg })
    .from(weightEntries)
    .where(eq(weightEntries.userId, userId))
    .orderBy(asc(weightEntries.onDate));
  const trend = weightTrend(entries);
  const trendChange = weeklyTrendChange(trend);
  const latestWeightKg = entries.length > 0 ? entries[entries.length - 1].weightKg : null;

  const profileRows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const profile = profileRows[0];

  let targets: Targets | null = null;
  let proposal: AdjustmentProposal | null = null;
  if (profile && latestWeightKg) {
    targets = computeTargets({
      goal: profile.goal as Goal,
      sexForFormula: profile.sexForFormula as SexForFormula,
      birthYear: profile.birthYear,
      heightCm: profile.heightCm,
      weightKg: latestWeightKg,
      activity: profile.activity as Activity,
      adjustmentKcal: profile.kcalAdjustment,
      pace: profile.pace as PaceKey | null,
    });
    proposal = proposeAdjustment({
      goal: profile.goal as Goal,
      weeklyTrendChangeKg: trendChange,
      latestWeightKg,
      daysLogged: dayStats.length,
      currentAdjustment: profile.kcalAdjustment,
    });
  }

  const review = buildWeekReview({
    dayStats,
    weeklyTrendChangeKg: trendChange,
    targets,
    showCalories,
    mealStats,
  });

  return { review, targets, proposal, weekStart, weekEnd, mealStats };
}
