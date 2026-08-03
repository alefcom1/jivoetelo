import { MealAnalysisError, SUGGEST_ERRORS } from "@/lib/ai";
import { resolveModel } from "@/lib/ai/client";
import { getSuggestionProvider } from "@/lib/ai/suggest";
import { dayGap } from "@/lib/day-gap";
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

  const decision = await checkQuota(auth.user.id, auth.user.plan, "suggest");
  if (!decision.allowed) return Response.json({ error: quotaMessage(decision) }, { status: 429 });

  try {
    const result = await getSuggestionProvider().suggest(context);
    await recordUsage(auth.user.id, "suggest", result.usage);
    return Response.json({ needsPlan: false, context: remaining, suggestions: result.suggestions });
  } catch (error) {
    if (error instanceof MealAnalysisError && error.reason === "disabled") {
      return Response.json({ error: SUGGEST_ERRORS.disabled }, { status: 503 });
    }
    // Модель в логе обязательна: ровно на неверном её идентификаторе
    // подсказки однажды и упали, а сообщение «tg suggest failed» без имени
    // модели не давало ни одной зацепки.
    console.error(`tg suggest failed (модель ${resolveModel("suggest")})`, error);
    return Response.json({ error: SUGGEST_ERRORS.failed }, { status: 502 });
  }
}
