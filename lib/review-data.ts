// Сбор данных недельного обзора. Лежит в lib/, а не рядом со страницей
// кабинета, потому что тот же обзор показывает Mini App (app/api/tg/review):
// пока модуль жил в app/app/review/, обзор существовал только в вебе, и
// человек, живущий в Telegram, вместо разбора недели видел ссылку «в
// веб-версии». Один сбор на оба клиента — иначе они разойдутся числами.

import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals, profiles, weightEntries } from "@/db/schema";
import { proposeAdjustment, type AdjustmentProposal } from "./adaptive.ts";
import { localToday, shiftDay } from "./dates.ts";
import { getDishImpact } from "./dish-impact.ts";
import { computeMealStats, type PeriodStats } from "./meal-stats.ts";
import { sumTotals } from "./nutrition.ts";
import { buildWeekReview, type DayStat, type WeekReview } from "./review.ts";
import { computeTargets, targetInputFromProfile, type Goal, type Targets } from "./targets.ts";
import { weeklyTrendChange, weightTrend } from "./trend.ts";

/** Границы накопленной адаптивной поправки (раздел 14.2 спецификации). */
const ADJUSTMENT_LIMIT = 450;

export type ReviewData = {
  review: WeekReview;
  targets: Targets | null;
  proposal: AdjustmentProposal | null;
  weekStart: string;
  weekEnd: string;
  /** Счётчики приёмов пищи за ту же неделю — те же числа, что на «Плане». */
  mealStats: PeriodStats;
  /** Раздел «Вес и еда» — тот же текст, что на «Плане» и в письме. */
  impact: { title: string; text: string } | null;
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
    targets = computeTargets(targetInputFromProfile(profile, latestWeightKg));
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

  const impact = await getDishImpact(userId, weekEnd);

  return { review, targets, proposal, weekStart, weekEnd, mealStats, impact: impact.section };
}

/**
 * Применить предложенную поправку к плану.
 *
 * Предложение сюда не передаётся, а пересчитывается: между показом обзора и
 * нажатием кнопки могут пройти сутки и появиться новые замеры веса. Клиент,
 * которому разрешили бы прислать своё число, применил бы устаревшее — или
 * любое другое, какое захочет.
 *
 * Возвращает применённую дельту, либо null, если предложения уже нет.
 */
export async function applyProposal(userId: number, showCalories: boolean): Promise<number | null> {
  const { proposal } = await getReviewData(userId, showCalories);
  if (!proposal) return null;

  const db = getDb();
  const rows = await db
    .select({ kcalAdjustment: profiles.kcalAdjustment })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  const current = rows[0]?.kcalAdjustment ?? 0;
  const next = Math.min(ADJUSTMENT_LIMIT, Math.max(-ADJUSTMENT_LIMIT, current + proposal.deltaKcal));
  await db.update(profiles).set({ kcalAdjustment: next, updatedAt: new Date() }).where(eq(profiles.userId, userId));
  // Реально применённая разница, а не предложенная: у края диапазона они
  // расходятся, и показать человеку «+50 ккал», прибавив 20, значит соврать.
  return next - current;
}
