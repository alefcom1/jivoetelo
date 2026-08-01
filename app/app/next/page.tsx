import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals, profiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { localToday } from "@/lib/dates";
import { sumTotals } from "@/lib/nutrition";
import type { PaceKey } from "@/lib/pace";
import { computeTargets, type Activity, type Goal, type SexForFormula } from "@/lib/targets";
import { getLatestWeightKg } from "@/lib/weight";
import { NextMealSuggestions } from "./next-meal-suggestions";

function nextMealLabel(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: process.env.APP_TIMEZONE ?? "Europe/Moscow" })
      .format(new Date()),
  );
  if (hour < 10) return "Завтрак";
  if (hour < 15) return "Обед";
  if (hour < 20) return "Ужин";
  return "Перекус";
}

export default async function NextMealPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getDb();
  const profileRows = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  const profile = profileRows[0];
  const weightKg = await getLatestWeightKg(user.id);

  if (!profile || !weightKg) {
    return <main className="next-meal">
      <h1>Что съесть дальше?</h1>
      <p className="addflow-hint">
        Чтобы подбирать варианты под ваш день, сначала настроим стартовый план — это займёт минуту.
      </p>
      <Link className="black-button" href="/app/onboarding">Настроить план <b>↗</b></Link>
    </main>;
  }

  const targets = computeTargets({
    goal: profile.goal as Goal,
    sexForFormula: profile.sexForFormula as SexForFormula,
    birthYear: profile.birthYear,
    heightCm: profile.heightCm,
    weightKg,
    activity: profile.activity as Activity,
    adjustmentKcal: profile.kcalAdjustment,
    pace: profile.pace as PaceKey | null,
  });

  const day = localToday();
  const dayMeals = await db
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.userId, user.id), eq(meals.eatenOn, day)));
  const ids = dayMeals.map((m) => m.id);
  const items = ids.length > 0 ? await db.select().from(mealItems).where(inArray(mealItems.mealId, ids)) : [];
  const consumed = sumTotals(items);

  // Только то, что нужно показать на экране и передать экшену. Привычные
  // блюда и съеденное сегодня экшен читает из базы сам — см. SuggestionHints.
  const context = {
    remainingKcal: Math.max(0, targets.kcalTarget - consumed.kcal),
    remainingProtein: Math.max(0, targets.proteinTarget - consumed.protein),
    remainingFiber: Math.max(0, targets.fiberTarget - consumed.fiber),
    mealTypeLabel: nextMealLabel(),
    round: 0,
  };

  return <main className="next-meal">
    <h1>Что съесть дальше?</h1>
    <p className="addflow-hint">
      {user.showCalories
        ? `Остаток на сегодня: примерно ${context.remainingKcal} ккал, белка — ${context.remainingProtein} г, клетчатки — ${context.remainingFiber} г.`
        : `Сегодня стоит добрать белка примерно ${context.remainingProtein} г и клетчатки ${context.remainingFiber} г.`}
      {" "}Подберём {context.mealTypeLabel.toLowerCase()} под этот остаток.
    </p>
    <NextMealSuggestions context={context} showCalories={user.showCalories} />
  </main>;
}
