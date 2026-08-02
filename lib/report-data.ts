// Сбор данных для отчёта: единственное место, где отчёт ходит в базу.
//
// Отдельно от lib/report.ts, потому что тот чистый и проверяется тестами без
// базы. Здесь только чтение и склейка — ни одного решения о том, что писать.
//
// Тот же сбор использует экран недельного обзора в кабинете
// (app/app/review/data.ts). Разводить их нельзя: письмо, которое расходится с
// экраном, читается как ошибка сервиса, даже если оба числа верны каждое по
// своему окну.

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals, profiles, reportPreferences, users, weightEntries } from "@/db/schema";
import { getDishImpact } from "./dish-impact.ts";
import { computeMealStats, type PeriodStats } from "./meal-stats.ts";
import { listLoggedDays } from "./meals.ts";
import { sumTotals } from "./nutrition.ts";
import type { PaceKey } from "./pace.ts";
import { buildReport, type Report } from "./report.ts";
import type { ReportPeriod } from "./report-period.ts";
import { DEFAULT_REPORT_PREFERENCES, type ReportPreferences } from "./report-prefs.ts";
import type { DayStat } from "./review.ts";
import { computeStreak } from "./streak.ts";
import { computeTargets, type Activity, type Goal, type SexForFormula, type Targets } from "./targets.ts";
import { weeklyTrendChange, weightTrend } from "./trend.ts";

export type PeriodData = {
  dayStats: DayStat[];
  mealStats: PeriodStats;
  targets: Targets | null;
  weeklyTrendChangeKg: number | null;
  latestWeightKg: number | null;
};

/**
 * Числа за произвольное окно. `windowKey` выбирает, каким считать окно в
 * lib/meal-stats.ts: «неделя» и «месяц» там отличаются длиной, а не смыслом.
 */
export async function collectPeriodData(
  userId: number,
  from: string,
  to: string,
  windowKey: "week" | "month" = "week",
): Promise<PeriodData> {
  const db = getDb();

  const periodMeals = await db
    .select({ id: meals.id, eatenOn: meals.eatenOn, eatenTime: meals.eatenTime, mealType: meals.mealType })
    .from(meals)
    .where(and(eq(meals.userId, userId), gte(meals.eatenOn, from), lte(meals.eatenOn, to)));

  const mealStats = computeMealStats(periodMeals, to, from)[windowKey];

  const mealIds = periodMeals.map((meal) => meal.id);
  const items = mealIds.length > 0 ? await db.select().from(mealItems).where(inArray(mealItems.mealId, mealIds)) : [];

  const dayByMeal = new Map(periodMeals.map((meal) => [meal.id, meal.eatenOn]));
  const itemsByDay = new Map<string, typeof items>();
  for (const item of items) {
    const day = dayByMeal.get(item.mealId);
    if (!day) continue;
    const list = itemsByDay.get(day) ?? [];
    list.push(item);
    itemsByDay.set(day, list);
  }
  const dayStats: DayStat[] = [...itemsByDay.entries()]
    .map(([day, dayItems]) => {
      const totals = sumTotals(dayItems);
      return { day, kcal: totals.kcal, protein: totals.protein, fiber: totals.fiber };
    })
    // Порядок дней в Map зависит от порядка строк из базы; отчёт не должен от
    // него зависеть вовсе.
    .sort((a, b) => a.day.localeCompare(b.day));

  // Замеры веса читаются целиком, а не за период: тренд строится по всей
  // истории (lib/trend.ts), и обрезанный вход дал бы обрезанный тренд.
  const entries = await db
    .select({ onDate: weightEntries.onDate, weightKg: weightEntries.weightKg })
    .from(weightEntries)
    .where(eq(weightEntries.userId, userId))
    .orderBy(asc(weightEntries.onDate));
  const trend = weightTrend(entries);

  // Вес «на конец периода» — последний замер НЕ ПОЗЖЕ конца периода. Взять
  // просто последний значило бы в месячном отчёте показать сегодняшний вес
  // рядом со статистикой прошлого месяца.
  const withinPeriod = entries.filter((entry) => entry.onDate <= to);
  const latestWeightKg = withinPeriod.at(-1)?.weightKg ?? null;

  const profileRows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const profile = profileRows[0];
  const targets = profile && latestWeightKg
    ? computeTargets({
        goal: profile.goal as Goal,
        sexForFormula: profile.sexForFormula as SexForFormula,
        birthYear: profile.birthYear,
        heightCm: profile.heightCm,
        weightKg: latestWeightKg,
        activity: profile.activity as Activity,
        adjustmentKcal: profile.kcalAdjustment,
        pace: profile.pace as PaceKey | null,
      })
    : null;

  return { dayStats, mealStats, targets, weeklyTrendChangeKg: weeklyTrendChange(trend), latestWeightKg };
}

export type ReportRecipient = {
  userId: number;
  email: string | null;
  telegramUserId: string | null;
  showCalories: boolean;
  prefs: ReportPreferences;
};

/** Настройки отчётов пользователя. Нет строки — значит всё по умолчанию. */
export function readPreferences(row: {
  weekly?: string | null;
  monthly?: string | null;
  weight_numbers?: boolean | null;
}): ReportPreferences {
  return {
    weekly: (row.weekly as ReportPreferences["weekly"]) ?? DEFAULT_REPORT_PREFERENCES.weekly,
    monthly: (row.monthly as ReportPreferences["monthly"]) ?? DEFAULT_REPORT_PREFERENCES.monthly,
    weightNumbers: row.weight_numbers ?? DEFAULT_REPORT_PREFERENCES.weightNumbers,
  };
}

/** Готовый отчёт за период. */
export async function buildUserReport(
  recipient: Pick<ReportRecipient, "userId" | "showCalories" | "prefs">,
  period: ReportPeriod,
): Promise<Report> {
  const [data, loggedDays, impact] = await Promise.all([
    collectPeriodData(recipient.userId, period.from, period.to, period.kind === "weekly" ? "week" : "month"),
    listLoggedDays(recipient.userId),
    // Разбор «еда и вес» — только в месячном отчёте. В недельном он почти
    // всегда молчит (нужно 14 дней данных минимум), и повторять «пока рано»
    // каждую неделю значит приучать пролистывать раздел.
    period.kind === "monthly" ? getDishImpact(recipient.userId, period.to) : Promise.resolve({ section: null }),
  ]);

  return buildReport({
    period,
    showCalories: recipient.showCalories,
    weightNumbers: recipient.prefs.weightNumbers,
    dayStats: data.dayStats,
    mealStats: data.mealStats,
    targets: data.targets,
    weeklyTrendChangeKg: data.weeklyTrendChangeKg,
    latestWeightKg: data.latestWeightKg,
    // Серия считается на конец периода, а не на сегодня: в отчёте за прошлую
    // неделю «серия: 3 дня» должна означать состояние на воскресенье.
    streak: computeStreak(loggedDays, period.to),
    impact: impact.section,
  });
}

/**
 * Почта, Telegram и настройки — всё, что нужно, чтобы отчёт дошёл.
 *
 * Имени здесь нет: у аккаунта его негде взять. Telegram присылает имя в
 * initData, но это данные сессии Mini App, а не поле профиля, и подставлять
 * их в письмо, отправленное через неделю, было бы подстановкой чужого
 * контекста. Отчёт обходится без обращения по имени.
 */
export async function getRecipient(userId: number): Promise<ReportRecipient | null> {
  const rows = await getDb()
    .select({
      id: users.id,
      email: users.email,
      telegramUserId: users.telegramUserId,
      showCalories: users.showCalories,
      weekly: reportPreferences.weekly,
      monthly: reportPreferences.monthly,
      weightNumbers: reportPreferences.weightNumbers,
    })
    .from(users)
    .leftJoin(reportPreferences, eq(reportPreferences.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user) return null;

  return {
    userId: user.id,
    email: user.email,
    telegramUserId: user.telegramUserId,
    showCalories: user.showCalories,
    prefs: readPreferences({ weekly: user.weekly, monthly: user.monthly, weight_numbers: user.weightNumbers }),
  };
}
