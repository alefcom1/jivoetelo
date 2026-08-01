import { frequentMeals, MAX_FREQUENT } from "./frequent-meals.ts";
import { getDaySummary, getRecentMealsForRepeat } from "./meals.ts";

/**
 * Часть контекста подсказок, которую можно взять только из дневника.
 *
 * ## Почему отдельным модулем, а не в трёх местах
 *
 * Подсказки вызываются из трёх точек: маршрут Mini App, серверный экшен веба
 * и страница «Что съесть дальше». Собирать этот кусок в каждой значило бы
 * однажды разойтись — и разойтись молча, потому что качество ответа модели
 * никакой тест не поймает.
 *
 * ## Почему только на сервере
 *
 * В серверном экшене числа контекста приходят с клиента и там же зажимаются
 * в разумные пределы — это защита от испорченного запроса. Названия блюд
 * такой защиты не допускают вовсе: это свободный текст, который уходит прямо
 * в запрос к модели. Прими мы его от клиента — получили бы способ дописать в
 * запрос что угодно. Поэтому дневник читается здесь, из базы, по
 * идентификатору пользователя, и клиент на эти поля не влияет никак.
 */

export type DiaryContext = {
  /** Что человек ест обычно. Пусто у новичка — повторять ещё нечего. */
  usualMeals: string[];
  /** Что уже съедено сегодня: предлагать это снова незачем. */
  eatenToday: string[];
};

/** Больше пяти строк в запросе перестают быть подсказкой и начинают шуметь. */
const MAX_USUAL = 5;

/**
 * Привычное и съеденное сегодня.
 *
 * `mealType` — вид ближайшего приёма пищи. Если по нему есть достаточно
 * привычных блюд, берём их: овсянка в списке для ужина сбивает модель с
 * толку не меньше, чем отсутствие списка вовсе. Если своих мало (обычно у
 * новичка), добираем остальными — неточная привычка полезнее пустоты.
 */
export async function getDiaryContext(
  userId: number,
  day: string,
  mealType?: string,
): Promise<DiaryContext> {
  const [summary, recent] = await Promise.all([
    getDaySummary(userId, day),
    getRecentMealsForRepeat(userId),
  ]);

  const frequent = frequentMeals(recent, MAX_FREQUENT);
  const sameType = mealType ? frequent.filter((meal) => meal.mealType === mealType) : [];
  const ordered = sameType.length >= 2
    ? [...sameType, ...frequent.filter((meal) => meal.mealType !== mealType)]
    : frequent;

  // Съеденное сегодня — по названиям позиций, без повторов и без граммов:
  // модели нужно знать, что творог уже был, а не сколько его было.
  const eatenToday = [...new Set(summary.meals.flatMap((meal) => meal.itemNames))];

  return {
    usualMeals: ordered.slice(0, MAX_USUAL).map((meal) => meal.title),
    eatenToday,
  };
}
