// Сбор данных для отчёта: единственное место, где отчёт ходит в базу.
//
// Отдельно от lib/report.ts, потому что тот чистый и проверяется тестами без
// базы. Здесь только чтение и склейка — ни одного решения о том, что писать.
//
// Тот же сбор использует экран недельного обзора в кабинете
// (lib/review-data.ts). Разводить их нельзя: письмо, которое расходится с
// экраном, читается как ошибка сервиса, даже если оба числа верны каждое по
// своему окну.

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals, profiles, reportPreferences, users, weightEntries } from "@/db/schema";
import { getDishImpact } from "./dish-impact.ts";
import { computeMealStats, type PeriodStats } from "./meal-stats.ts";
import { listLoggedDays } from "./meals.ts";
import { sumTotals } from "./nutrition.ts";
import { getInsightProvider } from "./ai/insight.ts";
import { checkQuota, recordUsage } from "./quota.ts";
import { buildInsightFacts, canAnalyze, habitReminders, insightSections } from "./report-insight.ts";
import { buildReport, type Report, type ReportSection } from "./report.ts";
import { effectivePlan } from "./paid.ts";
import type { Plan } from "./quota-policy.ts";
import type { ReportPeriod } from "./report-period.ts";
import { DEFAULT_REPORT_PREFERENCES, type ReportPreferences } from "./report-prefs.ts";
import type { DayStat } from "./review.ts";
import { computeStreak } from "./streak.ts";
import { computeTargets, targetInputFromProfile, type Targets } from "./targets.ts";
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
    ? computeTargets(targetInputFromProfile(profile, latestWeightKg))
    : null;

  return { dayStats, mealStats, targets, weeklyTrendChangeKg: weeklyTrendChange(trend), latestWeightKg };
}

export type ReportRecipient = {
  userId: number;
  email: string | null;
  telegramUserId: string | null;
  showCalories: boolean;
  prefs: ReportPreferences;
  /**
   * Действующий тариф — от него зависит, будет ли в отчёте разбор питания:
   * это обращение к модели, то есть платная часть (lib/quota-policy.ts).
   * Вычисляется из срока доступа, как и везде, а не читается из колонки.
   */
  plan: Plan;
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

/**
 * Частые блюда за период и был ли алкоголь.
 *
 * Считается здесь же, а не отдельным модулем: тот же список позиций уже
 * прочитан для дневных сумм, и второй запрос за теми же строками означал бы
 * два источника одного факта.
 */
async function dishesInPeriod(
  userId: number,
  from: string,
  to: string,
): Promise<{ frequent: Array<{ name: string; times: number }>; hadAlcohol: boolean }> {
  const db = getDb();
  const rows = await db
    .select({ name: mealItems.name })
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .where(and(eq(meals.userId, userId), gte(meals.eatenOn, from), lte(meals.eatenOn, to)));

  const counts = new Map<string, { name: string; times: number }>();
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    // Ключ по нижнему регистру: «Гречка» и «гречка» — одно блюдо, а в
    // списке из пяти позиций такая пара съедает два места из пяти.
    const key = name.toLowerCase();
    const seen = counts.get(key);
    if (seen) seen.times += 1;
    else counts.set(key, { name, times: 1 });
  }

  const frequent = [...counts.values()].sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
  const hadAlcohol = [...counts.keys()].some((name) => ALCOHOL_WORDS.some((word) => name.includes(word)));
  return { frequent: frequent.slice(0, 5), hadAlcohol };
}

/**
 * Слова, по которым видно алкоголь в записях.
 *
 * Список короткий и намеренно грубый: он решает единственный вопрос —
 * добавлять ли в отчёт одну нейтральную строку. Ошибка в любую сторону стоит
 * этой строки, и точность здесь не нужна. Оценок по нему не делается никаких.
 */
const ALCOHOL_WORDS = [
  "пив", "вин", "шампан", "виск", "водк", "конья", "ликёр", "ликер",
  "коктейл", "джин", "ром", "текил", "сидр", "настойк", "аперол", "мохито", "глинтвейн",
];

/** Готовый отчёт за период. */
export async function buildUserReport(
  recipient: Pick<ReportRecipient, "userId" | "showCalories" | "prefs" | "plan">,
  period: ReportPeriod,
): Promise<Report> {
  const [data, loggedDays, impact, dishes] = await Promise.all([
    collectPeriodData(recipient.userId, period.from, period.to, period.kind === "weekly" ? "week" : "month"),
    listLoggedDays(recipient.userId),
    // Разбор «еда и вес» — только в месячном отчёте. В недельном он почти
    // всегда молчит (нужно 14 дней данных минимум), и повторять «пока рано»
    // каждую неделю значит приучать пролистывать раздел.
    period.kind === "monthly" ? getDishImpact(recipient.userId, period.to) : Promise.resolve({ section: null }),
    dishesInPeriod(recipient.userId, period.from, period.to),
  ]);

  const insight = await collectInsight(recipient, period, data, dishes);

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
    insight,
  });
}

/**
 * Разбор питания моделью — или пусто, и это нормальный исход.
 *
 * ## Четыре причины промолчать, и все обязательные
 *
 * 1. **Мало данных.** Меньше трёх дней с записями — наблюдение о двух днях,
 *    звучащее как вывод о человеке (см. MIN_DAYS_FOR_INSIGHT).
 * 2. **Модель выключена.** `getInsightProvider` вернёт null, и ходить некуда.
 * 3. **Доступ закрыт или предохранитель сработал.** `checkQuota` отвечает на
 *    оба вопроса разом: у тарифа без доступа лимит нулевой, а общий дневной
 *    потолок расходов проверяется там же.
 * 4. **Запрос не прошёл.** Тогда отчёт уходит без раздела — и это в точности
 *    то, каким он был вчера. Ронять из-за разбора целое письмо нельзя:
 *    числа в нём человек ждёт, а наблюдение — приятное дополнение.
 *
 * Строка про привычки при этом остаётся всегда: она наша, детерминированная,
 * и модели для неё не нужно.
 */
async function collectInsight(
  recipient: Pick<ReportRecipient, "userId" | "showCalories" | "plan">,
  period: ReportPeriod,
  data: PeriodData,
  dishes: { frequent: Array<{ name: string; times: number }>; hadAlcohol: boolean },
): Promise<ReportSection[]> {
  // Номер периода — от даты конца, а не счётчиком: он должен быть одинаковым
  // при повторной сборке того же отчёта, иначе строка про привычки менялась
  // бы между предпросмотром и отправкой.
  const periodIndex = Math.floor(Date.parse(`${period.to}T00:00:00Z`) / 86_400_000 / 7);
  const habits = habitReminders({ periodIndex, hadAlcohol: dishes.hadAlcohol });

  const facts = buildInsightFacts({
    periodLabel: period.kind === "weekly" ? "неделя" : "месяц",
    daysInPeriod: Math.round(
      (Date.parse(`${period.to}T12:00:00Z`) - Date.parse(`${period.from}T12:00:00Z`)) / 86_400_000,
    ) + 1,
    dayStats: data.dayStats,
    targets: data.targets,
    frequentDishes: dishes.frequent,
    weightChangeKg: data.weeklyTrendChangeKg,
    showCalories: recipient.showCalories,
  });

  if (!canAnalyze(facts)) return insightSections(null, habits);

  const provider = getInsightProvider();
  if (!provider) return insightSections(null, habits);

  // Тариф настоящий, а не подставленный: у закрытого доступа лимит нулевой,
  // и разбор — платная часть ровно так же, как разбор фотографии.
  const decision = await checkQuota(recipient.userId, recipient.plan, "review_insight");
  if (!decision.allowed) return insightSections(null, habits);

  try {
    const result = await provider.analyze(facts);
    await recordUsage(recipient.userId, "review_insight", result.usage);
    return insightSections(result.insight, habits);
  } catch (error) {
    console.error("[report] разбор питания не получился", error);
    return insightSections(null, habits);
  }
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
      accessUntil: users.accessUntil,
      createdAt: users.createdAt,
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
    plan: effectivePlan(user.accessUntil, user.createdAt, new Date()),
  };
}
