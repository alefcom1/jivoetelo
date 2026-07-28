import { getSuggestionProvider } from "@/lib/ai/suggest";
import { localToday } from "@/lib/dates";
import { getDaySummary } from "@/lib/meals";
import { authorize } from "../_auth";

function nextMealLabel(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: process.env.APP_TIMEZONE ?? "Europe/Moscow",
    }).format(new Date()),
  );
  if (hour < 10) return "Завтрак";
  if (hour < 15) return "Обед";
  if (hour < 20) return "Ужин";
  return "Перекус";
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  // Остаток дня считает сервер по данным из БД — клиент ничего не подсказывает.
  const summary = await getDaySummary(auth.user.id, localToday());
  if (!summary.targets) {
    return Response.json({ needsPlan: true, suggestions: [] });
  }

  const kcalMid = Math.round((summary.targets.kcalMin + summary.targets.kcalMax) / 2);
  const context = {
    remainingKcal: Math.max(0, kcalMid - summary.totals.kcal),
    remainingProtein: Math.max(0, summary.targets.proteinTarget - summary.totals.protein),
    remainingFiber: Math.max(0, summary.targets.fiberTarget - summary.totals.fiber),
    mealTypeLabel: nextMealLabel(),
    showCalories: auth.user.showCalories,
  };

  try {
    const suggestions = await getSuggestionProvider().suggest(context);
    return Response.json({ needsPlan: false, context, suggestions });
  } catch (error) {
    console.error("tg suggest failed", error);
    return Response.json({ error: "Не получилось подобрать варианты. Попробуйте через минуту." }, { status: 502 });
  }
}
