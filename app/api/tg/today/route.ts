import { localToday, MEAL_TYPE_LABELS } from "@/lib/dates";
import { countPending, everUsedInbox } from "@/lib/inbox";
import { splitMacroTargets } from "@/lib/macro-split";
import { getDaySummary, listLoggedDays } from "@/lib/meals";
import { isSpeechEnabled } from "@/lib/speech/mode";
import { computeStreak } from "@/lib/streak";
import { weeklyTrendChange, weightTrend } from "@/lib/trend";
import { listRecentWeights } from "@/lib/weight";
import { authorize } from "../_auth";

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const today = localToday();
  // Независимые чтения — параллельно, а не одно за другим: ни одно не зависит
  // от результата другого.
  const [summary, inboxPending, weights, loggedDays, botEverUsed] = await Promise.all([
    getDaySummary(auth.user.id, today),
    countPending(auth.user.id),
    listRecentWeights(auth.user.id, 30),
    listLoggedDays(auth.user.id),
    // Для первых шагов: подсказку про бота показываем только тому, кто им
    // ни разу не пользовался (lib/first-run.ts).
    everUsedInbox(auth.user.id),
  ]);

  const trend = weightTrend(weights);
  // Жир и углеводы не хранятся отдельной целью (см. lib/macro-split.ts) —
  // считаем их прямо здесь, рядом с остальными целями дня.
  const macros = summary.targets ? splitMacroTargets(summary.targets.kcalTarget, summary.targets.proteinTarget) : null;

  return Response.json({
    showCalories: auth.user.showCalories,
    simpleMode: auth.user.simpleMode,
    // Умеем ли расшифровывать голос. Знает об этом только сервер (там лежит
    // SPEECH_URL), а прятать кнопку записи должен клиент — без этого поля он
    // предлагает то, чего нет, и человек узнаёт об отказе уже после записи.
    speechEnabled: isSpeechEnabled(),
    day: summary.day,
    totals: summary.totals,
    targets: summary.targets && macros ? { ...summary.targets, ...macros } : summary.targets,
    meals: summary.meals.map((meal) => ({
      id: meal.id,
      time: meal.eatenTime,
      title: MEAL_TYPE_LABELS[meal.mealType] ?? MEAL_TYPE_LABELS.other,
      items: meal.itemNames,
      // Снимок отдаём ключом, а не ссылкой: качает его Mini App отдельным
      // запросом с подписью initData (app/tg/photo.tsx) — в адрес картинки
      // подпись класть нельзя.
      photoKey: meal.photoKey,
      kcal: meal.totals.kcal,
      protein: meal.totals.protein,
    })),
    inboxPending,
    // null, если записей веса ещё нет: рисовать график не из чего.
    weight: trend.length > 0 ? { entries: trend, weeklyChangeKg: weeklyTrendChange(trend) } : null,
    // Числа серии считаются здесь, а текст — на клиенте (lib/mascot.ts):
    // реплики персонажа живут рядом с картинкой, которую они подписывают.
    streak: computeStreak(loggedDays, today),
    /**
     * Всё, что нужно первым шагам сверх уже отданного. Отдельного запроса
     * ради подсказок не делаем — состояние собирается из того, что и так
     * приходит на экран.
     */
    firstRun: {
      seen: auth.user.firstRunHints ?? [],
      hasPlan: summary.targets !== null,
      loggedDays: loggedDays.length,
      botEverUsed,
    },
  });
}
