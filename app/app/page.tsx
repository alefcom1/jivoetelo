import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { formatDayRu, isValidDay, localToday, MEAL_TYPE_LABELS, shiftDay } from "@/lib/dates";
import { sumTotals } from "@/lib/nutrition";

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

  return <main className="day">
    <div className="day-nav">
      <Link href={`/app?date=${shiftDay(day, -1)}`} aria-label="Предыдущий день">←</Link>
      <h1>{formatDayRu(day)}</h1>
      <Link href={`/app?date=${shiftDay(day, 1)}`} aria-label="Следующий день">→</Link>
    </div>

    <section className="day-totals">
      {user.showCalories && <div><strong>{dayTotals.kcal}</strong><span>ккал</span></div>}
      <div><strong>{dayTotals.protein}</strong><span>белок, г</span></div>
      <div><strong>{dayTotals.fiber}</strong><span>клетчатка, г</span></div>
      <div><strong>{dayTotals.fat}</strong><span>жиры, г</span></div>
      <div><strong>{dayTotals.carbs}</strong><span>углеводы, г</span></div>
    </section>

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
