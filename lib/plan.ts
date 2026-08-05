// Данные экрана «План» (Mini App v2): динамика веса, приверженность дневнику
// и разбор адаптивной цели. Отдельный модуль, а не код прямо в route-файле —
// тот же приём, что и lib/review-data.ts у недельного обзора: сборка данных из базы
// живёт рядом с остальным бэкендом, а не размазана по обработчику запроса.

import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { meals, profiles, weightEntries } from "@/db/schema";
import { computeAdherence, hasEnoughAdherenceData, type AdherenceResult } from "./adherence.ts";
import { localToday, shiftDay } from "./dates.ts";
import { getDishImpact } from "./dish-impact.ts";
import { seasonDays } from "./awards-store.ts";
import { lastMonths, seasonReport, type SeasonReport } from "./season.ts";
import { seasonWindow } from "./season-window.ts";
import { listLoggedDays } from "./meals.ts";
import { computeMealStats, hasEnoughMealStats, type MealStats } from "./meal-stats.ts";
import { computeTdee, computeTargets, type Activity, type Goal, type SexForFormula, type Targets } from "./targets.ts";
import { weeklyTrendChange, weightTrend, type TrendPoint } from "./trend.ts";

/** Окно наблюдения для приверженности — восемь недель: достаточно, чтобы
 * увидеть паттерн по дням недели, и не настолько много, чтобы полугодовой
 * давности перерыв в записях всё ещё портил картину «как сейчас». */
const ADHERENCE_WINDOW_DAYS = 56;
/** Сколько последних точек тренда показываем на графике — эстетика, не точность:
 * сам тренд считается по всей истории, здесь только урезаем отрисовку. */
const CHART_POINTS_LIMIT = 60;

export type PlanTargets = Targets & { tdeeKcal: number; goal: Goal; kcalAdjustment: number };

export type PlanData = {
  targets: PlanTargets | null;
  trend: TrendPoint[];
  weeklyTrendChangeKg: number | null;
  latestWeightKg: number | null;
  targetWeightKg: number | null;
  hasEnoughTrendData: boolean;
  adherence: AdherenceResult;
  hasEnoughAdherenceData: boolean;
  /** Сколько и когда человек ест — счётчики за неделю и за месяц. */
  mealStats: MealStats;
  hasEnoughMealStats: { week: boolean; month: boolean };
  /**
   * Раздел «Вес и еда» — готовый текст или null, когда показывать нечего.
   * Текстом, а не числами: формулировка здесь и есть содержание, и собирается
   * она в одном месте (lib/impact-text.ts), чтобы экран и письмо не разошлись.
   */
  impact: { title: string; text: string } | null;
  /**
   * Срез месяц-к-месяцу (lib/season.ts) — то, что обещает веха «Три месяца».
   *
   * Появляется, как только наберётся два сравнимых месяца, а окно растёт
   * вместе с человеком: три месяца, полгода, год. Награда обещает именно
   * размах, а не сам факт появления, — иначе рабочую возможность пришлось бы
   * держать выключенной до девяностого дня ради красивой лестницы.
   */
  season: SeasonReport;
};

export async function getPlanData(userId: number): Promise<PlanData> {
  const db = getDb();
  const today = localToday();

  const [profileRows, weightRows, adherenceEarliest, impact] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
    db
      .select({ onDate: weightEntries.onDate, weightKg: weightEntries.weightKg })
      .from(weightEntries)
      .where(eq(weightEntries.userId, userId)),
    findEarliestActivityDay(userId, today),
    getDishImpact(userId, today),
  ]);

  const profile = profileRows[0];
  const trend = weightTrend(weightRows);
  const weeklyTrendChangeKg = weeklyTrendChange(trend);
  const latestWeightKg = trend.length > 0 ? trend[trend.length - 1].weightKg : null;

  let targets: PlanTargets | null = null;
  if (profile && latestWeightKg) {
    const shared = {
      goal: profile.goal as Goal,
      sexForFormula: profile.sexForFormula as SexForFormula,
      birthYear: profile.birthYear,
      heightCm: profile.heightCm,
      weightKg: latestWeightKg,
      activity: profile.activity as Activity,
    };
    targets = {
      ...computeTargets({ ...shared, adjustmentKcal: profile.kcalAdjustment }),
      tdeeKcal: Math.round(computeTdee(shared)),
      goal: shared.goal,
      kcalAdjustment: profile.kcalAdjustment,
    };
  }

  // Один запрос на оба разбора: приверженности нужны дни с записями, статистике
  // — сами приёмы со временем и типом. Окно берём по большему из двух (56 дней);
  // computeMealStats урежет своё до 7 и 30 дней сам.
  const windowMeals = await db
    .select({ eatenOn: meals.eatenOn, eatenTime: meals.eatenTime, mealType: meals.mealType })
    .from(meals)
    .where(and(eq(meals.userId, userId), gte(meals.eatenOn, shiftDay(today, -(ADHERENCE_WINDOW_DAYS - 1)))));

  const adherence = computeAdherence(
    windowMeals.map((r) => r.eatenOn),
    today,
    adherenceEarliest,
    ADHERENCE_WINDOW_DAYS,
  );
  const mealStats = computeMealStats(windowMeals, today, adherenceEarliest);

  /**
   * Срез месяц-к-месяцу. Окно берётся от числа дней с записями, а не от даты
   * регистрации: человек, заведший аккаунт год назад и записавший десять
   * дней, находится там же, где новичок.
   */
  const loggedDays = await listLoggedDays(userId);
  const months = seasonWindow(loggedDays.length);
  const season = seasonReport(
    await seasonDays(userId, lastMonths(today, months)[0] + "-01"),
    weightRows.map((row) => ({ day: row.onDate, weightKg: row.weightKg })),
    today,
    months,
  );

  return {
    impact: impact.section,
    season,
    mealStats,
    hasEnoughMealStats: {
      week: hasEnoughMealStats(mealStats.week),
      month: hasEnoughMealStats(mealStats.month),
    },
    targets,
    trend: trend.slice(-CHART_POINTS_LIMIT),
    weeklyTrendChangeKg,
    latestWeightKg,
    targetWeightKg: profile?.targetWeightKg ?? null,
    hasEnoughTrendData: weeklyTrendChangeKg !== null,
    adherence,
    hasEnoughAdherenceData: hasEnoughAdherenceData(adherence),
  };
}

/**
 * Самая ранняя дата активности — первый вес или первый приём пищи, смотря что
 * раньше. Нужна, чтобы окно приверженности не заходило в прошлое до того, как
 * человек вообще начал пользоваться сервисом (см. комментарий в lib/adherence.ts).
 * Если истории вовсе нет, окно схлопывается до одного дня — и это честно:
 * рано показывать паттерн по дням недели тому, кто только начал.
 */
async function findEarliestActivityDay(userId: number, today: string): Promise<string> {
  const db = getDb();
  const [earliestWeight, earliestMeal] = await Promise.all([
    db
      .select({ onDate: weightEntries.onDate })
      .from(weightEntries)
      .where(eq(weightEntries.userId, userId))
      .orderBy(weightEntries.onDate)
      .limit(1),
    db.select({ eatenOn: meals.eatenOn }).from(meals).where(eq(meals.userId, userId)).orderBy(meals.eatenOn).limit(1),
  ]);
  const candidates = [earliestWeight[0]?.onDate, earliestMeal[0]?.eatenOn, today].filter((d): d is string => !!d);
  return candidates.sort()[0];
}
