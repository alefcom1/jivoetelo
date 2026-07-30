import { localToday, MEAL_TYPE_LABELS } from "@/lib/dates";
import { countPending } from "@/lib/inbox";
import { splitMacroTargets } from "@/lib/macro-split";
import { getDaySummary } from "@/lib/meals";
import { weeklyTrendChange, weightTrend } from "@/lib/trend";
import { listRecentWeights } from "@/lib/weight";
import { authorize } from "../_auth";

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  // Три независимых чтения — параллельно, а не одно за другим: ни одно не
  // зависит от результата другого.
  const [summary, inboxPending, weights] = await Promise.all([
    getDaySummary(auth.user.id, localToday()),
    countPending(auth.user.id),
    listRecentWeights(auth.user.id, 30),
  ]);

  const trend = weightTrend(weights);
  // Жир и углеводы не хранятся отдельной целью (см. lib/macro-split.ts) —
  // считаем их прямо здесь, рядом с остальными целями дня.
  const macros = summary.targets ? splitMacroTargets(summary.targets.kcalTarget, summary.targets.proteinTarget) : null;

  return Response.json({
    showCalories: auth.user.showCalories,
    day: summary.day,
    totals: summary.totals,
    targets: summary.targets && macros ? { ...summary.targets, ...macros } : summary.targets,
    meals: summary.meals.map((meal) => ({
      id: meal.id,
      time: meal.eatenTime,
      title: MEAL_TYPE_LABELS[meal.mealType] ?? MEAL_TYPE_LABELS.other,
      items: meal.itemNames,
      kcal: meal.totals.kcal,
      protein: meal.totals.protein,
    })),
    inboxPending,
    // null, если записей веса ещё нет: рисовать график не из чего.
    weight: trend.length > 0 ? { entries: trend, weeklyChangeKg: weeklyTrendChange(trend) } : null,
  });
}
