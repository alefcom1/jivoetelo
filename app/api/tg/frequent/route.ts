import { repeatableMeals } from "@/lib/frequent-meals";
import { getRecentMealsForRepeat } from "@/lib/meals";
import { authorize } from "../_auth";

/**
 * Что можно повторить в один тап: привычное, а следом просто недавнее.
 *
 * Квоту не трогает и в AI не ходит вовсе: это чтение собственного дневника
 * человека. Поэтому подсказки работают и когда разбор выключен, и когда
 * исчерпан дневной потолок расходов — ровно тогда, когда они нужнее всего.
 *
 * Раньше отдавалось только привычное (два и более повтора одного состава), и
 * блок на «Камере» у большинства не появлялся вовсе — см. repeatableMeals.
 */
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const meals = repeatableMeals(await getRecentMealsForRepeat(auth.user.id));

  return Response.json({
    meals: meals.map((meal) => ({
      key: meal.key,
      title: meal.title,
      mealType: meal.mealType,
      count: meal.count,
      // Дата нужна экрану: разовую запись он подписывает днём («вчера»), а не
      // числом повторов — «1 раз за два месяца» не подсказка, а недоразумение.
      lastEatenOn: meal.lastEatenOn,
      kcal: meal.kcal,
      protein: meal.protein,
      items: meal.items,
    })),
  });
}
