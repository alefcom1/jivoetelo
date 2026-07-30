import { frequentMeals } from "@/lib/frequent-meals";
import { getRecentMealsForRepeat } from "@/lib/meals";
import { authorize } from "../_auth";

/**
 * «Как обычно?» — частые приёмы пищи для повтора в один тап.
 *
 * Квоту не трогает и в AI не ходит вовсе: это чтение собственного дневника
 * человека. Поэтому подсказки работают и когда разбор выключен, и когда
 * исчерпан дневной потолок расходов — ровно тогда, когда они нужнее всего.
 */
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const meals = frequentMeals(await getRecentMealsForRepeat(auth.user.id));

  return Response.json({
    meals: meals.map((meal) => ({
      key: meal.key,
      title: meal.title,
      mealType: meal.mealType,
      count: meal.count,
      kcal: meal.kcal,
      protein: meal.protein,
      items: meal.items,
    })),
  });
}
