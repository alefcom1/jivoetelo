"use server";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isHintKey } from "@/lib/first-run";

/**
 * Отметить объяснения первых шагов пройденными.
 *
 * Серверное действие, а не маршрут: в вебе это обычная форма без своего API,
 * и заводить эндпоинт ради одного массива строк незачем. Mini App ходит в
 * `/api/tg/hints` только потому, что у него нет сессии — там подпись initData.
 *
 * Объединение делает база, а не код: между чтением и записью человек успевает
 * закрыть подсказку в другой вкладке, и одна из отметок пропала бы. Пропавшая
 * отметка — это подсказка, которая вернулась после того, как её закрыли.
 */
export async function markHints(hints: string[]): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const keys = [...new Set(hints.filter(isHintKey))];
  if (keys.length === 0) return;

  await getDb()
    .update(users)
    .set({
      firstRunHints: sql`(
        SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
        FROM jsonb_array_elements_text(${users.firstRunHints} || ${JSON.stringify(keys)}::jsonb) AS value
      )`,
    })
    .where(eq(users.id, user.id));
}
