// Живая проверка слоя базы: запускается вручную против настоящего Postgres,
// в `npm test` не входит (расширение .live.mjs, а не .test.mjs).
//   DATABASE_URL=... node tests/water-store.live.mjs
import assert from "node:assert/strict";
import { getDb } from "../db/index.ts";
import { mealItems, meals, profiles, users, waterEntries, weightEntries } from "../db/schema.ts";
import { eq } from "drizzle-orm";
import { addWater, getWaterDay, listDayWater, sumWaterByDay, undoLastWater } from "../lib/water-store.ts";

const db = getDb();
const [user] = await db.insert(users).values({ email: `water-${Date.now()}@test.local` }).returning();
const day = "2026-08-08";

try {
  assert.equal((await listDayWater(user.id, day)).length, 0, "новый день пуст");

  assert.equal(await addWater(user.id, day, 250), true);
  assert.equal(await addWater(user.id, day, 200), true);
  assert.equal(await addWater(user.id, day, 500), true);

  const afterAdds = await getWaterDay(user.id, day);
  assert.equal(afterAdds.drunkMl, 950, `сумма дня: ${afterAdds.drunkMl}`);
  assert.equal(afterAdds.canUndo, true);
  assert.equal(afterAdds.foodMl, 0, "еды не записано — воды из еды нет");
  assert.equal(afterAdds.goalMl, null, "без профиля ориентира нет");

  // Отмена убирает именно последнюю запись, а не самую большую.
  assert.equal(await undoLastWater(user.id, day), true);
  const afterUndo = await getWaterDay(user.id, day);
  assert.equal(afterUndo.drunkMl, 450, `после отмены: ${afterUndo.drunkMl}`);

  // Границы: ноль и заведомо лишний объём не записываются.
  assert.equal(await addWater(user.id, day, 0), false);
  assert.equal(await addWater(user.id, day, 99999), false);
  assert.equal((await getWaterDay(user.id, day)).drunkMl, 450, "мусор не изменил сумму");

  // Другой день не смешивается с этим.
  await addWater(user.id, "2026-08-07", 300);
  assert.equal((await getWaterDay(user.id, day)).drunkMl, 450);
  const byDay = await sumWaterByDay(user.id);
  assert.deepEqual(byDay, [{ day: "2026-08-07", ml: 300 }, { day: "2026-08-08", ml: 450 }]);

  // Пустой день: отменять нечего, и это не ошибка.
  assert.equal(await undoLastWater(user.id, "2026-01-01"), false);

  // Ориентир появляется вместе с профилем и весом — и считается от расхода,
  // а не от цели по калориям.
  await db.insert(profiles).values({
    userId: user.id,
    goal: "lose",
    sexForFormula: "male",
    birthYear: 1990,
    heightCm: 180,
    activity: "moderate",
  });
  await db.insert(weightEntries).values({ userId: user.id, onDate: day, weightKg: 85 });
  const withPlan = await getWaterDay(user.id, day);
  assert.ok(withPlan.goalMl !== null, "с профилем и весом ориентир обязан появиться");
  assert.ok(
    withPlan.goalMl > 1200 && withPlan.goalMl < 3500,
    `ориентир вне правдоподобного коридора: ${withPlan.goalMl} мл`,
  );

  // Вода из еды считается по настоящим позициям дневника.
  const [meal] = await db
    .insert(meals)
    .values({ userId: user.id, eatenOn: day, eatenTime: "13:00", mealType: "lunch" })
    .returning();
  await db.insert(mealItems).values({
    mealId: meal.id,
    name: "борщ",
    grams: 300,
    kcalPer100: 50,
    proteinPer100: 1.5,
    fatPer100: 2.5,
    carbsPer100: 5,
    fiberPer100: 1,
  });
  const withFood = await getWaterDay(user.id, day);
  // 300 г борща — это примерно 267 мл воды: 100 − 10 − 1 = 89% от 300.
  assert.ok(
    Math.abs(withFood.foodMl - 267) <= 3,
    `вода из еды посчитана неверно: ${withFood.foodMl} мл вместо ≈267`,
  );

  // Каскад: удаление человека уносит его записи.
  await db.delete(users).where(eq(users.id, user.id));
  const left = await db.select().from(waterEntries).where(eq(waterEntries.userId, user.id));
  assert.equal(left.length, 0, "записи не удалились вместе с аккаунтом");

  console.log("live-проверка слоя базы пройдена");
} finally {
  await db.delete(users).where(eq(users.id, user.id));
  process.exit(0);
}
