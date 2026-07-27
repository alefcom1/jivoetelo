import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { formatDayRu, MEAL_TYPE_LABELS } from "@/lib/dates";
import { itemTotals, sumTotals } from "@/lib/nutrition";
import { MealDetailActions } from "./meal-detail-actions";

export default async function MealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const mealId = Number(id);
  if (!Number.isInteger(mealId)) notFound();

  const db = getDb();
  const rows = await db
    .select()
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, user.id)))
    .limit(1);
  const meal = rows[0];
  if (!meal) notFound();

  const items = await db.select().from(mealItems).where(eq(mealItems.mealId, meal.id));
  const totals = sumTotals(items);

  return <main className="meal-detail">
    <Link className="back-link" href={`/app?date=${meal.eatenOn}`}>← {formatDayRu(meal.eatenOn)}</Link>
    <h1>{MEAL_TYPE_LABELS[meal.mealType] ?? MEAL_TYPE_LABELS.other} · {meal.eatenTime}</h1>

    {meal.photoKey && (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="meal-photo" src={`/api/photos/${meal.photoKey}`} alt="Фото приёма пищи" />
    )}
    {meal.sourceText && <p className="meal-source">«{meal.sourceText}»</p>}

    <table className="meal-items">
      <thead><tr><th>Позиция</th><th>Вес</th>{user.showCalories && <th>ккал</th>}<th>Белок</th><th>Клетчатка</th></tr></thead>
      <tbody>
        {items.map((item) => {
          const t = itemTotals(item);
          return <tr key={item.id}>
            <td>{item.name}{item.confidence === "low" && <i> · неточно</i>}</td>
            <td>{item.grams} г</td>
            {user.showCalories && <td>{t.kcal}</td>}
            <td>{t.protein} г</td>
            <td>{t.fiber} г</td>
          </tr>;
        })}
      </tbody>
      <tfoot>
        <tr><td>Итого</td><td /> {user.showCalories && <td>{totals.kcal}</td>}<td>{totals.protein} г</td><td>{totals.fiber} г</td></tr>
      </tfoot>
    </table>

    <MealDetailActions mealId={meal.id} hasPhoto={!!meal.photoKey} />
  </main>;
}
