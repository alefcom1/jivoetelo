import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals, profiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { formatDayRu, isValidDay, localToday, MEAL_TYPE_LABELS, shiftDay } from "@/lib/dates";
import { sumTotals } from "@/lib/nutrition";
import { computeTargets, type Activity, type Goal, type SexForFormula, type Targets } from "@/lib/targets";
import { getLatestWeight } from "./profile-actions";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { date } = await searchParams;
  const day = isValidDay(date) ? date : localToday();

  const db = getDb();
  const dayMeals = await db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, user.id), eq(meals.eatenOn, day)))
    .orderBy(meals.eatenTime);
  const ids = dayMeals.map((m) => m.id);
  const items = ids.length > 0 ? await db.select().from(mealItems).where(inArray(mealItems.mealId, ids)) : [];
  const itemsByMeal = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemsByMeal.get(item.mealId) ?? [];
    list.push(item);
    itemsByMeal.set(item.mealId, list);
  }
  const dayTotals = sumTotals(items);

  const profileRows = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  const profile = profileRows[0];
  const weightKg = profile ? await getLatestWeight(user.id) : null;
  let targets: Targets | null = null;
  if (profile && weightKg) {
    targets = computeTargets({
      goal: profile.goal as Goal,
      sexForFormula: profile.sexForFormula as SexForFormula,
      birthYear: profile.birthYear,
      heightCm: profile.heightCm,
      weightKg,
      activity: profile.activity as Activity,
    });
  }

  return <main className="day">
    <div className="day-nav">
      <Link href={`/app?date=${shiftDay(day, -1)}`} aria-label="Предыдущий день">←</Link>
      <h1>{formatDayRu(day)}</h1>
      <Link href={`/app?date=${shiftDay(day, 1)}`} aria-label="Следующий день">→</Link>
    </div>

    {!targets && <section className="plan-banner">
      <p>Настройте стартовый план — и мы покажем, сколько энергии и белка стоит добирать за день.</p>
      <Link className="black-button" href="/app/onboarding">Настроить план <b>↗</b></Link>
    </section>}

    <section className="day-totals">
      {user.showCalories && <div>
        <strong>{dayTotals.kcal}</strong>
        <span>ккал{targets ? ` из ${targets.kcalMin}–${targets.kcalMax}` : ""}</span>
      </div>}
      <div><strong>{dayTotals.protein}</strong><span>белок, г{targets ? ` из ~${targets.proteinTarget}` : ""}</span></div>
      <div><strong>{dayTotals.fiber}</strong><span>клетчатка, г{targets ? ` из ~${targets.fiberTarget}` : ""}</span></div>
      <div><strong>{dayTotals.fat}</strong><span>жиры, г</span></div>
      <div><strong>{dayTotals.carbs}</strong><span>углеводы, г</span></div>
    </section>

    {targets && <Link className="next-card" href="/app/next">
      <b>Что съесть дальше?</b>
      <span>Подберём {user.showCalories ? "вариант под остаток дня" : "вариант, который поддержит ваш день"} →</span>
    </Link>}

    {dayMeals.length === 0
      ? <section className="day-empty">
          <p>Пока пусто. Добавьте первый приём пищи — текстом или фото, это займёт меньше минуты.</p>
          <Link className="black-button" href="/app/add">Добавить еду <b>↗</b></Link>
        </section>
      : <section className="day-meals">
          {dayMeals.map((meal) => {
            const mealItemList = itemsByMeal.get(meal.id) ?? [];
            const totals = sumTotals(mealItemList);
            return <Link className="day-meal" href={`/app/meals/${meal.id}`} key={meal.id}>
              <time>{meal.eatenTime}</time>
              <div>
                <b>{MEAL_TYPE_LABELS[meal.mealType] ?? MEAL_TYPE_LABELS.other}</b>
                <span>{mealItemList.map((i) => i.name).slice(0, 4).join(", ")}</span>
              </div>
              <strong>
                {user.showCalories && <>{totals.kcal}<small> ккал</small></>}
                <em>белок {totals.protein} г</em>
              </strong>
            </Link>;
          })}
          <Link className="black-button day-add" href="/app/add">Добавить еду <b>↗</b></Link>
        </section>}
  </main>;
}
