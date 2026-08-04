// Чтение данных для разбора «блюдо → вес» и правила, при которых разбор
// вообще не показывается.
//
// Сама математика — в lib/weight-response.ts (чистая, с тестами), тексты — в
// lib/impact-text.ts. Здесь только база и допуск.

import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals, profiles, users, weightEntries } from "@/db/schema";
import { localToday, shiftDay } from "./dates.ts";
import { buildImpactSection } from "./impact-text.ts";
import { buildIntake, pickCandidates } from "./intake.ts";
import { analyseDishImpact, type ImpactReport } from "./weight-response.ts";

/** Окно разбора. Три месяца — предел, за которым рацион уже другой. */
const WINDOW_DAYS = 90;

/**
 * Почему разбор не показан. `null` — показан.
 *
 * Это не технические ошибки, а сознательные отказы: у каждого своя причина, и
 * каждая должна быть видна в коде, а не спрятана в условии.
 */
export type ImpactBlockReason = "minor" | "calories_hidden" | "no_profile";

export type DishImpact = {
  report: ImpactReport | null;
  blocked: ImpactBlockReason | null;
  section: { title: string; text: string } | null;
};

/**
 * Кому разбор не показывается вовсе.
 *
 * **Несовершеннолетним.** Тело ещё растёт, и разговор о том, как еда двигает
 * весы, в этом возрасте — вопрос к врачу, а не к приложению. Тот же приоритет,
 * что у `softeningReason`, где `minor` стоит выше всех прочих причин.
 *
 * **Тем, кто выключил калории.** Режим «скрыть калории» включают именно те,
 * кому цифры вредят. Показать им вместо цифр разбор по блюдам значило бы
 * обойти собственную защиту с другой стороны: числа спрятаны, а вердикты о
 * еде — нет.
 *
 * Полный набор сигналов безопасности (`lib/safety.ts`) здесь недоступен: он
 * собирается на онбординге и в базе не сохраняется — от него остаётся только
 * смягчённая цель. Это ограничение, а не решение: будь сигналы сохранены,
 * `hard_relationship` тоже был бы поводом молчать.
 */
function blockReason(birthYear: number | null, showCalories: boolean, currentYear: number): ImpactBlockReason | null {
  if (birthYear === null) return "no_profile";
  if (currentYear - birthYear < 18) return "minor";
  if (!showCalories) return "calories_hidden";
  return null;
}

export async function getDishImpact(userId: number, today = localToday()): Promise<DishImpact> {
  const db = getDb();
  const windowStart = shiftDay(today, -(WINDOW_DAYS - 1));

  const [userRows, profileRows] = await Promise.all([
    db.select({ showCalories: users.showCalories }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ birthYear: profiles.birthYear }).from(profiles).where(eq(profiles.userId, userId)).limit(1),
  ]);

  const blocked = blockReason(
    profileRows[0]?.birthYear ?? null,
    userRows[0]?.showCalories ?? true,
    Number(today.slice(0, 4)),
  );
  if (blocked) return { report: null, blocked, section: null };

  const [windowMeals, weights] = await Promise.all([
    db
      .select({ id: meals.id, eatenOn: meals.eatenOn, eatenTime: meals.eatenTime })
      .from(meals)
      .where(and(eq(meals.userId, userId), gte(meals.eatenOn, windowStart))),
    db
      .select({ onDate: weightEntries.onDate, weightKg: weightEntries.weightKg })
      .from(weightEntries)
      .where(and(eq(weightEntries.userId, userId), gte(weightEntries.onDate, windowStart))),
  ]);

  const mealIds = windowMeals.map((meal) => meal.id);
  const items = mealIds.length > 0
    ? await db
        .select({
          mealId: mealItems.mealId,
          dishKey: mealItems.dishKey,
          grams: mealItems.grams,
          kcalPer100: mealItems.kcalPer100,
        })
        .from(mealItems)
        .where(inArray(mealItems.mealId, mealIds))
    : [];

  const intake = buildIntake(windowMeals, items);
  const candidateKeys = pickCandidates(intake);
  const report = analyseDishImpact(weights, intake, candidateKeys);

  return { report, blocked: null, section: buildImpactSection(report) };
}

