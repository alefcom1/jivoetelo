import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  aiUsage,
  mealItems,
  meals,
  photoInbox,
  profiles,
  userConsents,
  users,
  waitlistSubscribers,
  weightEntries,
} from "@/db/schema";
import { deletePhoto } from "@/lib/storage";

/**
 * Экспорт и удаление аккаунта — право субъекта персональных данных по
 * 152-ФЗ (ст. 14) и обязательное условие для приёма оплаты. Логика вынесена
 * из route handler в модуль, чтобы её можно было вызвать и из будущего бота.
 */

export type AccountExport = Record<string, unknown>;

/**
 * Собирает всё, что сервис знает о пользователе. Ничего не пропускаем и
 * ничего не приукрашиваем: если поле есть в базе — оно есть в выгрузке.
 * Единственное исключение — хеш пароля: отдавать его назад бессмысленно и
 * опасно, а сам пароль мы не храним.
 */
export async function exportAccount(userId: number): Promise<AccountExport> {
  const db = getDb();

  const [account] = await db
    .select({
      id: users.id,
      email: users.email,
      plan: users.plan,
      showCalories: users.showCalories,
      telegramUserId: users.telegramUserId,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!account) throw new Error(`User ${userId} not found`);

  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);

  const mealRows = await db
    .select()
    .from(meals)
    .where(eq(meals.userId, userId))
    .orderBy(asc(meals.eatenOn), asc(meals.eatenTime));

  const itemRows = mealRows.length
    ? await db
        .select()
        .from(mealItems)
        .where(inArray(mealItems.mealId, mealRows.map((meal) => meal.id)))
    : [];

  const [weights, consents, usage, waitlist, inbox] = await Promise.all([
    db.select().from(weightEntries).where(eq(weightEntries.userId, userId)).orderBy(asc(weightEntries.onDate)),
    db.select().from(userConsents).where(eq(userConsents.userId, userId)).orderBy(asc(userConsents.acceptedAt)),
    db.select().from(aiUsage).where(eq(aiUsage.userId, userId)).orderBy(asc(aiUsage.createdAt)),
    db.select().from(waitlistSubscribers).where(eq(waitlistSubscribers.email, account.email)),
    db.select().from(photoInbox).where(eq(photoInbox.userId, userId)).orderBy(asc(photoInbox.createdAt)),
  ]);

  return {
    описание: "Выгрузка всех данных аккаунта в сервисе «Живое Тело».",
    сформировано: new Date().toISOString(),
    аккаунт: account,
    согласия: consents,
    план: profile ?? null,
    приёмы_пищи: mealRows.map((meal) => ({
      ...meal,
      // Фото лежат файлами; по этой ссылке их можно скачать, пока аккаунт жив.
      фото: meal.photoKey ? `/api/photos/${meal.photoKey}` : null,
      состав: itemRows.filter((item) => item.mealId === meal.id),
    })),
    вес: weights,
    фото_инбокс: inbox.map((item) => ({
      ...item,
      фото: item.dismissedAt ? null : `/api/photos/${item.photoKey}`,
    })),
    обращения_к_ai: usage,
    лист_ожидания: waitlist,
    примечание:
      "Хеш пароля не выгружается: пароль в исходном виде сервис не хранит. Записи о платежах здесь отсутствуют — приём оплаты не включён.",
  };
}

/**
 * Полное удаление аккаунта. Сначала файлы, потом строка пользователя:
 * если упадём на середине, останется мусор в базе, а не осиротевшие фото
 * без владельца — так проще доубрать вручную и меньше риск отдать чужой файл.
 *
 * Всё остальное (приёмы пищи, состав, вес, согласия, сессии, привязка
 * Telegram) уходит каскадом по внешним ключам. Платежи не удаляются: у них
 * ON DELETE SET NULL, потому что документы о расчётах оператор обязан
 * хранить по закону, — но связь с человеком при этом рвётся.
 */
export async function deleteAccount(userId: number): Promise<void> {
  const db = getDb();

  const [mealPhotos, inboxPhotos] = await Promise.all([
    db.select({ photoKey: meals.photoKey }).from(meals).where(eq(meals.userId, userId)),
    db.select({ photoKey: photoInbox.photoKey }).from(photoInbox).where(eq(photoInbox.userId, userId)),
  ]);

  // Ключи из инбокса и из приёмов пищи пересекаются: разобранное фото
  // остаётся тем же файлом. Множество убирает повторное удаление.
  for (const photoKey of new Set([...mealPhotos, ...inboxPhotos].map((row) => row.photoKey))) {
    if (photoKey) await deletePhoto(photoKey);
  }

  await db.delete(users).where(eq(users.id, userId));
}
