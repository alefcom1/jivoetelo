/**
 * Запросы раздела Про.
 *
 * Здесь только работа с базой; правила — в `./access.ts`, проход к данным
 * клиента — в `./guard.ts`. Разделение не косметическое: правила должны
 * проверяться тестами без базы, а база не должна знать про правила, иначе
 * появится второе место, где решается вопрос «можно ли».
 *
 * Обратите внимание, чего здесь нет: функции, которая по идентификатору
 * специалиста отдаёт дневник клиента. Такой функции быть не должно — за
 * данными клиента ходят через `withClientScope`, и только так.
 */

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { localToday, shiftDay } from "../dates.ts";
import {
  meals,
  proApplications,
  specialistAccessLog,
  specialistClients,
  specialistInvites,
  specialists,
  users,
} from "../../db/schema.ts";
import { createInviteCode, type InviteRow } from "./invite.ts";
import { scopesToGrants, type AccessScope } from "./access.ts";

/* ------------------------------------------------------------------ */
/*  Приглашения                                                        */
/* ------------------------------------------------------------------ */

/**
 * Выдаёт специалисту новый код. Старые не гасим: человек мог назвать код
 * клиенту и тут же нажать «ещё один» для второго — обнулять первый значило
 * бы сломать сценарий, ради которого кнопка и нажата.
 */
export async function issueInvite(
  specialistUserId: number,
  now: Date,
  randomBytes: (size: number) => Uint8Array,
): Promise<{ code: string; expiresAt: Date }> {
  const invite = createInviteCode(now, randomBytes);
  await getDb().insert(specialistInvites).values({
    code: invite.code,
    specialistUserId,
    expiresAt: invite.expiresAt,
  });
  return invite;
}

export async function findInvite(code: string): Promise<InviteRow | null> {
  const rows = await getDb()
    .select({
      code: specialistInvites.code,
      specialistUserId: specialistInvites.specialistUserId,
      expiresAt: specialistInvites.expiresAt,
      usedAt: specialistInvites.usedAt,
    })
    .from(specialistInvites)
    .where(eq(specialistInvites.code, code))
    .limit(1);
  return rows[0] ?? null;
}

/** Имя специалиста для экрана согласия: клиент должен видеть, кому открывает. */
export async function specialistNameFor(userId: number): Promise<string | null> {
  const rows = await getDb()
    .select({ displayName: specialists.displayName })
    .from(specialists)
    .where(and(eq(specialists.userId, userId), eq(specialists.status, "approved")))
    .limit(1);
  return rows[0]?.displayName ?? null;
}

/**
 * Заводит связь по приглашению. Код гасится, объём записывается.
 *
 * Повторное согласие той же паре обновляет строку, а не создаёт вторую: на
 * паре стоит уникальный индекс. Заодно это оживляет отозванную связь —
 * ровно то, чего человек и хочет, снова вводя код того же специалиста.
 */
export async function acceptInvite(input: {
  code: string;
  clientUserId: number;
  specialistUserId: number;
  scopes: AccessScope[];
  clientName: string | null;
  now: Date;
}): Promise<void> {
  const db = getDb();
  const grants = scopesToGrants(input.scopes);

  await db
    .update(specialistInvites)
    .set({ usedAt: input.now, usedByUserId: input.clientUserId })
    .where(and(eq(specialistInvites.code, input.code), isNull(specialistInvites.usedAt)));

  await db
    .insert(specialistClients)
    .values({
      specialistUserId: input.specialistUserId,
      clientUserId: input.clientUserId,
      clientName: input.clientName,
      ...grants,
      acceptedAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [specialistClients.specialistUserId, specialistClients.clientUserId],
      set: { ...grants, clientName: input.clientName, revokedAt: null, updatedAt: input.now },
    });
}

/* ------------------------------------------------------------------ */
/*  Сторона клиента                                                    */
/* ------------------------------------------------------------------ */

export type ClientSideLink = {
  id: number;
  specialistUserId: number;
  specialistName: string;
  clientName: string | null;
  shareSummary: boolean;
  shareDiary: boolean;
  shareWeight: boolean;
  acceptedAt: Date;
  revokedAt: Date | null;
};

/** Кому клиент открыл доступ. Отозванные тоже: это его история. */
export async function listSpecialistsForClient(clientUserId: number): Promise<ClientSideLink[]> {
  return await getDb()
    .select({
      id: specialistClients.id,
      specialistUserId: specialistClients.specialistUserId,
      specialistName: specialists.displayName,
      clientName: specialistClients.clientName,
      shareSummary: specialistClients.shareSummary,
      shareDiary: specialistClients.shareDiary,
      shareWeight: specialistClients.shareWeight,
      acceptedAt: specialistClients.acceptedAt,
      revokedAt: specialistClients.revokedAt,
    })
    .from(specialistClients)
    .innerJoin(specialists, eq(specialists.userId, specialistClients.specialistUserId))
    .where(eq(specialistClients.clientUserId, clientUserId))
    .orderBy(desc(specialistClients.acceptedAt));
}

/**
 * Меняет объём доступа. Обязательно с проверкой владельца в самом запросе:
 * идентификатор связи приходит из формы, то есть от пользователя, и
 * «сначала прочитать, потом обновить» оставило бы щель между двумя запросами.
 */
export async function updateScopes(linkId: number, clientUserId: number, scopes: AccessScope[], now: Date): Promise<void> {
  await getDb()
    .update(specialistClients)
    .set({ ...scopesToGrants(scopes), updatedAt: now })
    .where(and(eq(specialistClients.id, linkId), eq(specialistClients.clientUserId, clientUserId)));
}

/** Отзыв. Строку не удаляем — она остаётся историей, см. комментарий к таблице. */
export async function revokeLink(linkId: number, clientUserId: number, now: Date): Promise<void> {
  await getDb()
    .update(specialistClients)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(specialistClients.id, linkId), eq(specialistClients.clientUserId, clientUserId)));
}

export type AccessLogEntry = { specialistName: string; scope: string; at: Date };

/** Журнал доступа — для клиента. Специалисту он не показывается никогда. */
export async function listAccessLog(clientUserId: number, limit = 50): Promise<AccessLogEntry[]> {
  return await getDb()
    .select({
      specialistName: specialists.displayName,
      scope: specialistAccessLog.scope,
      at: specialistAccessLog.at,
    })
    .from(specialistAccessLog)
    .innerJoin(specialists, eq(specialists.userId, specialistAccessLog.specialistUserId))
    .where(eq(specialistAccessLog.clientUserId, clientUserId))
    .orderBy(desc(specialistAccessLog.at))
    .limit(limit);
}

/* ------------------------------------------------------------------ */
/*  Сторона специалиста                                                */
/* ------------------------------------------------------------------ */

export type ClientRow = {
  clientUserId: number;
  clientName: string | null;
  shareSummary: boolean;
  shareDiary: boolean;
  shareWeight: boolean;
  acceptedAt: Date;
  /** Дата последней записи в дневнике. Ничего о содержимом не сообщает. */
  lastMealOn: string | null;
  /** Дней с записями за последние семь. Тоже о регулярности, а не о еде. */
  loggedDays: number;
};

/**
 * Список клиентов. Показывает только то, что специалисту и так разрешено
 * знать: имя, объём доступа и дату последней записи.
 *
 * Дата последней записи здесь не считается нарушением объёма: это факт о
 * том, ведётся ли дневник вообще, а не о его содержимом, и без него список
 * бесполезен — специалист не поймёт, с кем работа идёт, а с кем нет. Само
 * содержимое остаётся за `withClientScope`.
 *
 * По той же причине считается и число дней с записями за неделю: это
 * регулярность, а не еда. Из неё складывается метка в списке — и складывается
 * прозрачно, вместе с основанием (см. `./status.ts`).
 */
export async function listClients(specialistUserId: number): Promise<ClientRow[]> {
  const lastMeal = getDb()
    .select({ userId: meals.userId, lastOn: sql<string>`max(${meals.eatenOn})`.as("last_on") })
    .from(meals)
    .groupBy(meals.userId)
    .as("last_meal");

  // Семь дней, считая сегодняшний, — поэтому смещение на шесть.
  const since = shiftDay(localToday(), -6);
  const week = getDb()
    .select({
      userId: meals.userId,
      // Именно distinct: три записи за один день — это один день, а не три.
      days: sql<number>`count(distinct ${meals.eatenOn})`.as("logged_days"),
    })
    .from(meals)
    .where(gte(meals.eatenOn, since))
    .groupBy(meals.userId)
    .as("week_logged");

  const rows = await getDb()
    .select({
      clientUserId: specialistClients.clientUserId,
      clientName: specialistClients.clientName,
      shareSummary: specialistClients.shareSummary,
      shareDiary: specialistClients.shareDiary,
      shareWeight: specialistClients.shareWeight,
      acceptedAt: specialistClients.acceptedAt,
      lastMealOn: lastMeal.lastOn,
      loggedDays: week.days,
    })
    .from(specialistClients)
    .leftJoin(lastMeal, eq(lastMeal.userId, specialistClients.clientUserId))
    .leftJoin(week, eq(week.userId, specialistClients.clientUserId))
    .where(
      and(eq(specialistClients.specialistUserId, specialistUserId), isNull(specialistClients.revokedAt)),
    )
    .orderBy(desc(specialistClients.acceptedAt));

  // leftJoin отдаёт null тому, у кого записей за неделю не было; для правил
  // это ноль, а не «неизвестно». Приводим здесь, чтобы дальше не гадали.
  // count() в postgres возвращается строкой — Number обязателен.
  return rows.map((row) => ({ ...row, loggedDays: Number(row.loggedDays ?? 0) }));
}

/** Одна строка клиента — для экрана клиента в кабинете. */
export async function findClientRow(specialistUserId: number, clientUserId: number): Promise<ClientRow | null> {
  const rows = await listClients(specialistUserId);
  return rows.find((row) => row.clientUserId === clientUserId) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Админка                                                            */
/* ------------------------------------------------------------------ */

export async function listApplications(limit = 200) {
  return await getDb().select().from(proApplications).orderBy(desc(proApplications.createdAt)).limit(limit);
}

export type SpecialistAdminRow = {
  userId: number;
  /** null у аккаунта из Mini App — специалисту почта не обязательна. */
  email: string | null;
  displayName: string;
  specialization: string | null;
  city: string | null;
  about: string | null;
  status: string;
  /** `null` — зарегистрировался сам и проверку не проходил. */
  verifiedAt: Date | null;
  createdAt: Date;
  clientCount: number;
};

export async function listSpecialists(): Promise<SpecialistAdminRow[]> {
  const counts = getDb()
    .select({
      specialistUserId: specialistClients.specialistUserId,
      clientCount: sql<number>`count(*)::int`.as("client_count"),
    })
    .from(specialistClients)
    .where(isNull(specialistClients.revokedAt))
    .groupBy(specialistClients.specialistUserId)
    .as("counts");

  const rows = await getDb()
    .select({
      userId: specialists.userId,
      email: users.email,
      displayName: specialists.displayName,
      specialization: specialists.specialization,
      city: specialists.city,
      about: specialists.about,
      status: specialists.status,
      verifiedAt: specialists.verifiedAt,
      createdAt: specialists.createdAt,
      clientCount: counts.clientCount,
    })
    .from(specialists)
    .innerJoin(users, eq(users.id, specialists.userId))
    .leftJoin(counts, eq(counts.specialistUserId, specialists.userId))
    .orderBy(desc(specialists.createdAt));

  return rows.map((row) => ({ ...row, clientCount: row.clientCount ?? 0 }));
}

/** Заводит профиль специалиста по email. Используется админкой при отборе. */
export async function createSpecialistByEmail(input: {
  email: string;
  displayName: string;
  specialization: string | null;
  city: string | null;
  now: Date;
}): Promise<{ ok: true } | { ok: false; reason: "no_user" | "exists" }> {
  const db = getDb();
  const found = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  const userId = found[0]?.id;
  // Специалист — это существующий аккаунт. Заводить учётку за человека мы не
  // будем: пароль он должен задать сам, а «пригласительная» регистрация — это
  // отдельный механизм, которого пока нет.
  if (!userId) return { ok: false, reason: "no_user" };

  const already = await db.select({ userId: specialists.userId }).from(specialists).where(eq(specialists.userId, userId)).limit(1);
  if (already.length > 0) return { ok: false, reason: "exists" };

  await db.insert(specialists).values({
    userId,
    displayName: input.displayName,
    specialization: input.specialization,
    city: input.city,
    status: "approved",
    approvedAt: input.now,
  });
  return { ok: true };
}

export async function setSpecialistStatus(userId: number, status: string, now: Date): Promise<void> {
  await getDb()
    .update(specialists)
    .set({ status, approvedAt: status === "approved" ? now : null })
    .where(eq(specialists.userId, userId));
}

/**
 * Завести кабинет самому.
 *
 * Строка сразу со статусом `approved` — то есть «может работать». Это не
 * послабление: кабинет сам по себе не открывает ни одного байта чужих
 * данных, он позволяет выдать код. Что откроется, решает клиент на экране
 * согласия, по каждому разделу отдельно, и отзывает в один клик. Настоящая
 * дверь стоит у клиента и охраняется `canAccess`; предварительная проверка
 * сторожила прихожую.
 *
 * `verifiedAt` при этом пустой, и клиент это видит: имя специалист указал
 * себе сам. Отметка появится, когда заявку посмотрит человек.
 *
 * `onConflictDoNothing` вместо проверки «а есть ли уже профиль»: между
 * чтением и вставкой человек успевает нажать кнопку во второй вкладке, а
 * ключ здесь — сам `user_id`.
 */
export async function registerSpecialist(input: {
  userId: number;
  displayName: string;
  specialization: string | null;
  city: string | null;
  about: string | null;
  now?: Date;
}): Promise<{ created: boolean }> {
  const now = input.now ?? new Date();
  const inserted = await getDb()
    .insert(specialists)
    .values({
      userId: input.userId,
      displayName: input.displayName,
      specialization: input.specialization,
      city: input.city,
      about: input.about,
      status: "approved",
      approvedAt: now,
    })
    .onConflictDoNothing({ target: specialists.userId })
    .returning({ userId: specialists.userId });
  return { created: inserted.length > 0 };
}

/** Правка профиля самим специалистом. Статус и отметку проверки не трогает. */
export async function updateSpecialistProfile(input: {
  userId: number;
  displayName: string;
  specialization: string | null;
  city: string | null;
  about: string | null;
}): Promise<void> {
  await getDb()
    .update(specialists)
    .set({
      displayName: input.displayName,
      specialization: input.specialization,
      city: input.city,
      about: input.about,
      // Правка имени сбрасывает отметку проверки: проверяли конкретного
      // человека под конкретным именем, и молча переносить доверие на новое
      // значило бы отдать отметку любому, кто зарегистрировался и
      // переименовался.
      verifiedAt: null,
    })
    .where(eq(specialists.userId, input.userId));
}

/**
 * Имя специалиста для клиента — вместе с тем, проверяли ли мы его.
 *
 * Два значения возвращаются одним запросом и одной функцией намеренно. Имя
 * без отметки о проверке — это утверждение, которого мы не делали: клиент,
 * увидев «Марина Петрова, нутрициолог», по умолчанию решит, что сервис
 * человека знает. С тех пор как регистрация стала самостоятельной, это
 * неправда, и раздельные вызовы рано или поздно дали бы экран с именем и
 * без оговорки.
 */
export async function specialistCardFor(
  userId: number,
): Promise<{ displayName: string; verified: boolean } | null> {
  const rows = await getDb()
    .select({ displayName: specialists.displayName, verifiedAt: specialists.verifiedAt })
    .from(specialists)
    .where(and(eq(specialists.userId, userId), eq(specialists.status, "approved")))
    .limit(1);
  const row = rows[0];
  return row ? { displayName: row.displayName, verified: row.verifiedAt !== null } : null;
}

/**
 * Отметка «профиль проверен человеком».
 *
 * Отдельно от статуса: статус отвечает «может ли работать», отметка — «мы
 * убедились, что за именем стоит практика». С самостоятельной регистрацией
 * это разные вопросы, и клиент видит именно второй.
 */
export async function setSpecialistVerified(userId: number, verified: boolean, now = new Date()): Promise<void> {
  await getDb()
    .update(specialists)
    .set({ verifiedAt: verified ? now : null })
    .where(eq(specialists.userId, userId));
}
