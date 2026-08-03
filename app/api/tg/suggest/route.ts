import { MealAnalysisError, SUGGEST_ERRORS } from "@/lib/ai";
import { resolveModel } from "@/lib/ai/client";
import { getSuggestionProvider } from "@/lib/ai/suggest";
import { dayGap, explain } from "@/lib/day-gap";
import { pickCandidates } from "@/lib/suggest-candidates";
import { localToday } from "@/lib/dates";
import { getDaySummary } from "@/lib/meals";
import { getDiaryContext } from "@/lib/suggest-context";
import { checkQuota, quotaMessage, recordUsage } from "@/lib/quota";
import { authorize } from "../_auth";

/** Вид ближайшего приёма пищи и его подпись — ключ нужен для отбора привычного. */
function nextMeal(): { type: string; label: string } {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: process.env.APP_TIMEZONE ?? "Europe/Moscow",
    }).format(new Date()),
  );
  if (hour < 10) return { type: "breakfast", label: "Завтрак" };
  if (hour < 15) return { type: "lunch", label: "Обед" };
  if (hour < 20) return { type: "dinner", label: "Ужин" };
  return { type: "snack", label: "Перекус" };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  // Какой это по счёту заход: с каждым «Показать другие» подбор смотрит на
  // еду с другой стороны. Число, и только число, — формулировки живут на
  // сервере (SUGGEST_ANGLES), снаружи текст в запрос к модели не попадает.
  const round = Number(new URL(request.url).searchParams.get("round") ?? 0);

  // Остаток дня считает сервер по данным из БД — клиент ничего не подсказывает.
  const summary = await getDaySummary(auth.user.id, localToday());
  if (!summary.targets) {
    return Response.json({ needsPlan: true, suggestions: [] });
  }

  const meal = nextMeal();
  // Остаток — то, что показывается на экране; дневник — то, что уходит в
  // запрос к модели. Разделены намеренно: обратно клиенту едет только первое.
  // Остаток считается по всем пяти величинам разом (lib/day-gap.ts). Жир и
  // углеводы там — потолки, а не цели: недобор по ним дефицитом не считается
  // и в подсказках не упоминается.
  const gap = dayGap(summary.targets, summary.totals);
  const remaining = {
    remainingKcal: gap.kcalLeft,
    remainingProtein: gap.proteinGap,
    remainingFiber: gap.fiberGap,
    mealTypeLabel: meal.label,
  };
  const context = {
    ...remaining,
    fatLeft: gap.fatLeft,
    carbsLeft: gap.carbsLeft,
    showCalories: auth.user.showCalories,
    round: Number.isFinite(round) ? Math.max(0, Math.min(99, Math.floor(round))) : 0,
    ...(await getDiaryContext(auth.user.id, localToday(), meal.type)),
  };

  // Отбор — наш и детерминированный. Раньше блюда придумывала модель, и
  // проверить, что предложенное укладывается в остаток дня, было нечем:
  // числа приходили от неё же. Теперь названия и числа наши, а модели
  // остаётся формулировка — то, что она делает лучше нас.
  const candidates = pickCandidates(gap, {
    exclude: context.eatenToday,
    offset: context.round * 3,
  });

  // Готовый ответ на случай, когда разбор выключен или модель не отозвалась.
  // Это не заглушка: числа те же самые, отличается только слог объяснения.
  const withoutModel = candidates.map((candidate) => ({
    title: candidate.title,
    why: explain(candidate, auth.user.showCalories, candidate.portion.kcal),
    approxKcal: Math.round(candidate.portion.kcal),
    approxProtein: Math.round(candidate.portion.protein),
    approxFiber: Math.round(candidate.portion.fiber),
    timeMinutes: 0,
  }));

  const decision = await checkQuota(auth.user.id, auth.user.plan, "suggest");
  if (!decision.allowed) return Response.json({ error: quotaMessage(decision) }, { status: 429 });

  try {
    const result = await getSuggestionProvider().suggest({
      ...context,
      candidates: candidates.map((c) => ({
        title: c.title,
        kcal: c.portion.kcal,
        protein: c.portion.protein,
        fiber: c.portion.fiber,
      })),
    });
    await recordUsage(auth.user.id, "suggest", result.usage);

    // От модели берём только формулировку и только по порядку. Числа и
    // названия остаются нашими: сверить чужие мы не можем, а расходиться им
    // нельзя — под карточкой стоит наш расчёт остатка дня. Если модель
    // ответила не тем количеством вариантов, значит задачу она не выполнила,
    // и объяснение берётся своё.
    const aligned = result.suggestions.length === withoutModel.length
      ? withoutModel.map((own, i) => ({ ...own, why: result.suggestions[i].why, timeMinutes: result.suggestions[i].timeMinutes }))
      : withoutModel;

    return Response.json({ needsPlan: false, context: remaining, suggestions: aligned });
  } catch (error) {
    // Разбор выключен — не повод оставлять человека без подсказки: отбор
    // сделан без модели и работает сам по себе.
    if (error instanceof MealAnalysisError && error.reason === "disabled") {
      return Response.json({ needsPlan: false, context: remaining, suggestions: withoutModel });
    }
    // Модель в логе обязательна: ровно на неверном её идентификаторе
    // подсказки однажды и упали, а сообщение «tg suggest failed» без имени
    // модели не давало ни одной зацепки.
    console.error(`tg suggest failed (модель ${resolveModel("suggest")})`, error);
    return Response.json({ error: SUGGEST_ERRORS.failed }, { status: 502 });
  }
}
