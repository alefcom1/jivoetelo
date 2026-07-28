import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { weightEntries } from "@/db/schema";

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
