import { isValidDay, localToday } from "@/lib/dates";
import { buildDiaryMeals, clampDiaryDay, diaryDayTotals } from "@/lib/diary";
import { splitMacroTargets } from "@/lib/macro-split";
import { getDiaryDayRows, getTargetsForUser } from "@/lib/meals";
import { authorize } from "../_auth";

/**
 * Данные экрана «Дневник» за один день: итог дня, цели (для компактной
 * сводки в духе «Сегодня») и список приёмов пищи. День передаётся строкой
 * `?day=YYYY-MM-DD` — по умолчанию сегодня; будущее клампится к сегодня же
 * (lib/diary.ts, clampDiaryDay), чтобы прямой запрос с чужой датой не
 * возвращал то, чего объективно ещё нет.
 */
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const today = localToday();
  const requestedDay = url.searchParams.get("day") ?? undefined;
  const day = clampDiaryDay(isValidDay(requestedDay) ? requestedDay : today, today);

  const [{ meals: mealRows, items }, targets] = await Promise.all([
    getDiaryDayRows(auth.user.id, day),
    getTargetsForUser(auth.user.id),
  ]);

  // Жир и углеводы не хранятся отдельной целью — считаем их прямо здесь,
  // тем же приёмом, что и app/api/tg/today/route.ts.
  const macros = targets ? splitMacroTargets(targets.kcalTarget, targets.proteinTarget) : null;

  return Response.json({
    day,
    isToday: day === today,
    showCalories: auth.user.showCalories,
    totals: diaryDayTotals(items),
    targets: targets && macros ? { ...targets, ...macros } : targets,
    meals: buildDiaryMeals(mealRows, items),
  });
}
