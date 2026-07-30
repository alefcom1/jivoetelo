import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { weightEntries } from "@/db/schema";
import type { WeightPoint } from "./trend.ts";

/** Последний записанный вес пользователя или null. */
export async function getLatestWeightKg(userId: number): Promise<number | null> {
  const rows = await getDb()
    .select({ weightKg: weightEntries.weightKg })
    .from(weightEntries)
    .where(eq(weightEntries.userId, userId))
    .orderBy(desc(weightEntries.onDate))
    .limit(1);
  return rows[0]?.weightKg ?? null;
}

/**
 * Последние записи веса по возрастанию даты — готовый вход для
 * `weightTrend` (lib/trend.ts) и мини-графика на «Сегодня» в Mini App.
 * Берём с конца (DESC + limit), затем разворачиваем: иначе на длинной
 * истории пришлось бы сглаживать весь ряд ради последних точек графика.
 */
export async function listRecentWeights(userId: number, limit = 30): Promise<WeightPoint[]> {
  const rows = await getDb()
    .select({ onDate: weightEntries.onDate, weightKg: weightEntries.weightKg })
    .from(weightEntries)
    .where(eq(weightEntries.userId, userId))
    .orderBy(desc(weightEntries.onDate))
    .limit(limit);
  return rows.reverse();
}
