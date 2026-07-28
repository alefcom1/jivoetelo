import { localToday, MEAL_TYPE_LABELS } from "@/lib/dates";
import { getDaySummary } from "@/lib/meals";
import { authorize } from "../_auth";

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const summary = await getDaySummary(auth.user.id, localToday());
  return Response.json({
    showCalories: auth.user.showCalories,
    day: summary.day,
    totals: summary.totals,
    targets: summary.targets,
    meals: summary.meals.map((meal) => ({
      id: meal.id,
      time: meal.eatenTime,
      title: MEAL_TYPE_LABELS[meal.mealType] ?? MEAL_TYPE_LABELS.other,
      items: meal.itemNames,
      kcal: meal.totals.kcal,
      protein: meal.totals.protein,
    })),
  });
}
