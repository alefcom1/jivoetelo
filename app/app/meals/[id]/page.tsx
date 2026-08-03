import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { formatDayRu, MEAL_TYPE_LABELS } from "@/lib/dates";
import { PRODUCTS } from "@/lib/products";
import { MealDetailActions } from "./meal-detail-actions";
import { MealItemsPanel } from "./meal-items-panel";
import { SharePhoto } from "../../share-photo";

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

  return <main className="meal-detail">
    <Link className="back-link" href={`/app?date=${meal.eatenOn}`}>← {formatDayRu(meal.eatenOn)}</Link>
    <h1>{MEAL_TYPE_LABELS[meal.mealType] ?? MEAL_TYPE_LABELS.other} · {meal.eatenTime}</h1>

    {meal.photoKey && (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="meal-photo" src={`/api/photos/${meal.photoKey}`} alt="Фото приёма пищи" />
    )}
    {meal.sourceText && <p className="meal-source">«{meal.sourceText}»</p>}

    <MealItemsPanel
      mealId={meal.id}
      showCalories={user.showCalories}
      initialMealType={meal.mealType}
      initialTime={meal.eatenTime}
      initialItems={items.map((item) => ({
        name: item.name,
        grams: item.grams,
        kcalPer100: item.kcalPer100,
        proteinPer100: item.proteinPer100,
        fatPer100: item.fatPer100,
        carbsPer100: item.carbsPer100,
        fiberPer100: item.fiberPer100,
        confidence: item.confidence,
      }))}
    />

    <MealDetailActions mealId={meal.id} hasPhoto={!!meal.photoKey} />

    {/* Поделиться можно только тем, что в каталоге и правда есть: снимок
        привязывается к конкретной странице продукта, а не висит сам по себе.
        Если ни одна позиция записи каталогу не известна, блока нет вовсе. */}
    {meal.photoKey && <SharePhoto
      mealId={meal.id}
      candidates={items
        .map((item) => {
          const product = PRODUCTS.find((candidate) => candidate.name === item.name);
          return product ? { slug: product.slug, name: product.name, grams: item.grams } : null;
        })
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))}
    />}
  </main>;
}
