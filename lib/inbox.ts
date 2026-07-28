/**
 * Фото-инбокс: снимки, присланные боту, до того как они станут приёмом пищи.
 *
 * Смысл разделения простой. Сфотографировать тарелку можно за секунду в любой
 * обстановке; отвечать на уточняющие вопросы разбора — нет. Инбокс разводит
 * эти два действия во времени, не теряя ни фото, ни момента, когда оно
 * сделано.
 */

import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { photoInbox } from "@/db/schema";
import { deletePhoto } from "./storage.ts";

export type InboxItem = {
  id: number;
  photoKey: string;
  note: string | null;
  takenOn: string;
  takenTime: string;
};

/** Сколько снимков пришло за день — считает и разобранные, для дневного лимита. */
export async function countInboxToday(userId: number, day: string): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(photoInbox)
    .where(and(eq(photoInbox.userId, userId), eq(photoInbox.takenOn, day)));
  return rows[0]?.value ?? 0;
}

/** Неразобранные снимки за конкретный день — основание для вечернего дайджеста. */
export async function countPendingOnDay(userId: number, day: string): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(photoInbox)
    .where(
      and(
        eq(photoInbox.userId, userId),
        eq(photoInbox.takenOn, day),
        isNull(photoInbox.processedAt),
        isNull(photoInbox.dismissedAt),
      ),
    );
  return rows[0]?.value ?? 0;
}

export async function addToInbox(input: {
  userId: number;
  photoKey: string;
  note: string | null;
  takenOn: string;
  takenTime: string;
}): Promise<number> {
  const inserted = await getDb().insert(photoInbox).values(input).returning({ id: photoInbox.id });
  return inserted[0].id;
}

/** Всё, что ждёт разбора, — новые сверху. Без ограничения по дню: старое тоже видно. */
export async function listPending(userId: number, limit = 50): Promise<InboxItem[]> {
  return await getDb()
    .select({
      id: photoInbox.id,
      photoKey: photoInbox.photoKey,
      note: photoInbox.note,
      takenOn: photoInbox.takenOn,
      takenTime: photoInbox.takenTime,
    })
    .from(photoInbox)
    .where(and(eq(photoInbox.userId, userId), isNull(photoInbox.processedAt), isNull(photoInbox.dismissedAt)))
    .orderBy(desc(photoInbox.takenOn), desc(photoInbox.takenTime), desc(photoInbox.id))
    .limit(limit);
}

/** Одна запись инбокса — с проверкой владельца прямо в запросе. */
export async function getPendingItem(userId: number, id: number): Promise<InboxItem | null> {
  const rows = await getDb()
    .select({
      id: photoInbox.id,
      photoKey: photoInbox.photoKey,
      note: photoInbox.note,
      takenOn: photoInbox.takenOn,
      takenTime: photoInbox.takenTime,
    })
    .from(photoInbox)
    .where(
      and(
        eq(photoInbox.userId, userId),
        eq(photoInbox.id, id),
        isNull(photoInbox.processedAt),
        isNull(photoInbox.dismissedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Отмечает снимок разобранным. Файл при этом не трогаем: приём пищи ссылается
 * на тот же ключ, и удалять его теперь нельзя.
 */
export async function markProcessed(userId: number, id: number, mealId: number): Promise<void> {
  await getDb()
    .update(photoInbox)
    .set({ processedAt: new Date(), mealId })
    .where(and(eq(photoInbox.userId, userId), eq(photoInbox.id, id)));
}

/**
 * Отклоняет снимок: строка остаётся как след, файл удаляется. Держать на
 * диске фото, которое человек явно отбросил, незачем — VPS не резиновый, а
 * лишние персональные данные хранить не следует и по 152-ФЗ.
 */
export async function dismissItem(userId: number, id: number): Promise<boolean> {
  const rows = await getDb()
    .update(photoInbox)
    .set({ dismissedAt: new Date() })
    .where(
      and(
        eq(photoInbox.userId, userId),
        eq(photoInbox.id, id),
        isNull(photoInbox.processedAt),
        isNull(photoInbox.dismissedAt),
      ),
    )
    .returning({ photoKey: photoInbox.photoKey });

  const row = rows[0];
  if (!row) return false;
  await deletePhoto(row.photoKey).catch(() => {});
  return true;
}
