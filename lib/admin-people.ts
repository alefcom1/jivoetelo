/**
 * Карточка человека для админки: всё, что сервис о нём знает.
 *
 * ## Про доступ
 *
 * Доступ полный — так решено владельцем сервиса. Ограничений здесь нет и не
 * задумано; вместо них — запись о каждом обращении (`logAdminAccess`).
 * Журнал не мешает смотреть, он отвечает на вопрос «кто и когда смотрел»,
 * который задают при жалобе или проверке, и отвечать на него надо записью,
 * а не по памяти.
 *
 * ## Про поиск
 *
 * Ищем по почте и по идентификатору, но не по содержимому дневника. Поиск
 * «кто ел пиццу» — это уже не работа с обращением конкретного человека, а
 * просмотр чужих записей наугад, и в инструменте поддержки ему нечего делать.
 */

import { and, desc, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adminAccessLog, meals, users, weightEntries } from "@/db/schema";
import { listAwards } from "./awards-store.ts";
import { effectivePlan } from "./paid.ts";
import { computeStreak } from "./streak.ts";
import { localToday } from "./dates.ts";
import { listLoggedDays } from "./meals.ts";

export type PersonRow = {
  id: number;
  email: string | null;
  telegramLinked: boolean;
  createdAt: Date;
  accessUntil: Date | null;
  loggedDays: number;
  lastMealOn: string | null;
};

/**
 * Список людей: последние зарегистрированные или совпавшие с запросом.
 *
 * Число дней с записями и дата последней — подзапросами, а не отдельными
 * обходами: без них список бесполезен (по одной почте не видно, живой это
 * аккаунт или заведён и брошен), а N+1 на сотне строк — это сотня запросов.
 */
export async function listPeople(query: string, limit = 50): Promise<PersonRow[]> {
  const trimmed = query.trim();
  const asId = Number(trimmed);
  const where = trimmed === ""
    ? undefined
    : Number.isInteger(asId) && asId > 0
      ? or(eq(users.id, asId), sql`${users.email} ILIKE ${`%${trimmed}%`}`)
      : sql`${users.email} ILIKE ${`%${trimmed}%`}`;

  const rows = await getDb()
    .select({
      id: users.id,
      email: users.email,
      telegramUserId: users.telegramUserId,
      createdAt: users.createdAt,
      accessUntil: users.accessUntil,
      loggedDays: sql<number>`(SELECT count(DISTINCT eaten_on)::int FROM meals m WHERE m.user_id = ${users.id})`,
      lastMealOn: sql<string | null>`(SELECT max(eaten_on)::text FROM meals m WHERE m.user_id = ${users.id})`,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    telegramLinked: row.telegramUserId !== null,
    createdAt: row.createdAt,
    accessUntil: row.accessUntil,
    loggedDays: Number(row.loggedDays ?? 0),
    lastMealOn: row.lastMealOn,
  }));
}

export type PersonCard = {
  id: number;
  email: string | null;
  telegramLinked: boolean;
  createdAt: Date;
  accessUntil: Date | null;
  plan: string;
  invitedByEmail: string | null;
  invitedCount: number;
  referralCode: string | null;
  streak: { totalDays: number; current: number; bestStreak: number };
  awards: Array<{ title: string; earnedOn: string }>;
  latestWeightKg: number | null;
  recentMeals: Array<{ id: number; eatenOn: string; eatenTime: string; sourceText: string | null }>;
};

/** Всё про одного человека. Пишет в журнал обращений — это и есть его смысл. */
export async function personCard(adminId: number, personId: number): Promise<PersonCard | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      telegramUserId: users.telegramUserId,
      createdAt: users.createdAt,
      accessUntil: users.accessUntil,
      referralCode: users.referralCode,
      invitedBy: users.invitedBy,
    })
    .from(users)
    .where(eq(users.id, personId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  await logAdminAccess(adminId, personId, "profile");

  const [inviter, invited, loggedDays, awards, weight, recent] = await Promise.all([
    row.invitedBy
      ? db.select({ email: users.email }).from(users).where(eq(users.id, row.invitedBy)).limit(1)
      : Promise.resolve([]),
    db.select({ id: users.id }).from(users).where(eq(users.invitedBy, personId)),
    listLoggedDays(personId),
    listAwards(personId),
    db
      .select({ weightKg: weightEntries.weightKg })
      .from(weightEntries)
      .where(eq(weightEntries.userId, personId))
      .orderBy(desc(weightEntries.onDate))
      .limit(1),
    db
      .select({
        id: meals.id,
        eatenOn: meals.eatenOn,
        eatenTime: meals.eatenTime,
        sourceText: meals.sourceText,
      })
      .from(meals)
      .where(eq(meals.userId, personId))
      .orderBy(desc(meals.eatenOn), desc(meals.eatenTime))
      .limit(20),
  ]);

  const streak = computeStreak(loggedDays, localToday());
  return {
    id: row.id,
    email: row.email,
    telegramLinked: row.telegramUserId !== null,
    createdAt: row.createdAt,
    accessUntil: row.accessUntil,
    plan: effectivePlan(row.accessUntil, new Date()),
    invitedByEmail: inviter[0]?.email ?? null,
    invitedCount: invited.length,
    referralCode: row.referralCode,
    streak: { totalDays: streak.totalDays, current: streak.current, bestStreak: streak.bestStreak },
    awards: awards.map((award) => ({ title: award.title, earnedOn: award.earnedOn })),
    latestWeightKg: weight[0]?.weightKg ?? null,
    recentMeals: recent,
  };
}

/**
 * Записать обращение к данным человека.
 *
 * Ошибка записи не должна ломать страницу: журнал — это след, а не условие
 * доступа, и уронить работу поддержки из-за него было бы хуже, чем потерять
 * одну строку. Но и молчать нельзя — потерянная строка видна в логе.
 */
export async function logAdminAccess(adminId: number, subjectId: number | null, scope: string): Promise<void> {
  try {
    await getDb().insert(adminAccessLog).values({ adminId, subjectId, scope });
  } catch (error) {
    console.error("не записалось обращение администратора", { adminId, subjectId, scope, error });
  }
}

export type AccessLogRow = {
  id: number;
  createdAt: Date;
  scope: string;
  adminEmail: string | null;
  subjectId: number | null;
};

/** Журнал обращений: свежие сверху. */
export async function listAdminAccessLog(limit = 100, subjectId?: number): Promise<AccessLogRow[]> {
  return getDb()
    .select({
      id: adminAccessLog.id,
      createdAt: adminAccessLog.createdAt,
      scope: adminAccessLog.scope,
      adminEmail: users.email,
      subjectId: adminAccessLog.subjectId,
    })
    .from(adminAccessLog)
    .leftJoin(users, eq(users.id, adminAccessLog.adminId))
    .where(subjectId ? and(eq(adminAccessLog.subjectId, subjectId)) : undefined)
    .orderBy(desc(adminAccessLog.createdAt))
    .limit(limit);
}
