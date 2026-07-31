/**
 * Проход к данным клиента. Единственный.
 *
 * ## Почему это отдельный модуль, а не проверка в каждой странице
 *
 * Правила доступа живут в `./access.ts` и покрыты тестами, но правило,
 * которое надо не забыть применить, рано или поздно забудут применить.
 * Достаточно одной новой страницы, где кто-то возьмёт данные напрямую из
 * `getDaySummary(clientId, day)` — и чужой дневник открыт, причём в логе
 * будет пусто, потому что журнал пишется рядом с проверкой.
 *
 * Поэтому здесь не «функция проверки», а `withClientScope`: данные клиента
 * достаются **только** внутри её колбэка. Проверка и запись в журнал — не
 * два шага, о которых надо помнить, а одно неделимое действие. Забыть
 * журнал, не потеряв при этом и доступ к данным, невозможно.
 *
 * Ту же роль играет `requireApprovedSpecialist`: страницы кабинета не
 * проверяют статус сами, они получают уже проверенного специалиста или
 * не получают ничего.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { specialistAccessLog, specialistClients, specialists } from "../../db/schema.ts";
import { canAccess, type AccessDenial, type AccessScope, type ClientLink, type SpecialistStatus } from "./access.ts";

export type ApprovedSpecialist = { userId: number; displayName: string };

/**
 * Профиль специалиста или `null`. Без подтверждения статуса — тоже `null`
 * на уровне `requireApprovedSpecialist`, но саму строку возвращаем как есть:
 * страница «ваша заявка на рассмотрении» должна отличать «нет профиля» от
 * «профиль есть, ждёт подтверждения».
 */
export async function getSpecialistProfile(
  userId: number,
): Promise<{ displayName: string; status: SpecialistStatus } | null> {
  const rows = await getDb()
    .select({ displayName: specialists.displayName, status: specialists.status })
    .from(specialists)
    .where(eq(specialists.userId, userId))
    .limit(1);
  const row = rows[0];
  return row ? { displayName: row.displayName, status: row.status as SpecialistStatus } : null;
}

/**
 * Текущий пользователь как подтверждённый специалист или `null`.
 *
 * Возвращает `null` во всех случаях отказа, не различая их: страницы
 * кабинета показывают один и тот же экран и не сообщают постороннему, есть
 * ли вообще такой раздел.
 */
export async function requireApprovedSpecialist(): Promise<ApprovedSpecialist | null> {
  // `getCurrentUser` импортируется лениво: он тянет `next/headers`, и обычный
  // импорт наверху сделал бы весь модуль незагружаемым в обычном node — а
  // значит, непроверяемым тестом. Периметр безопасности обязан быть
  // проверяемым, поэтому цена одной ленивой строки здесь оправдана:
  // `withClientScope` в сессии не нуждается и грузится сам по себе.
  const { getCurrentUser } = await import("../auth.ts");
  const user = await getCurrentUser();
  if (!user) return null;
  const profile = await getSpecialistProfile(user.id);
  if (!profile || profile.status !== "approved") return null;
  return { userId: user.id, displayName: profile.displayName };
}

/**
 * Строка связи пары или `null`, если её нет вовсе.
 *
 * Отозванные связи возвращаются **вместе с датой отзыва**, а не
 * отфильтровываются в SQL. Это выглядит как лишняя работа, но раньше здесь
 * стояло `isNull(revokedAt)` — и это была ошибка разделения: база решала то,
 * что принадлежит `canAccess`. Внешне всё работало (доступ закрывался), но
 * причина отказа приходила «связи нет» вместо «отозвано», а целая ветка
 * проверенного тестами модуля не срабатывала в бою ни разу. Правила живут в
 * одном месте, и это `./access.ts`.
 */
export async function getLink(specialistUserId: number, clientUserId: number): Promise<ClientLink | null> {
  const rows = await getDb()
    .select({
      specialistUserId: specialistClients.specialistUserId,
      clientUserId: specialistClients.clientUserId,
      shareSummary: specialistClients.shareSummary,
      shareDiary: specialistClients.shareDiary,
      shareWeight: specialistClients.shareWeight,
      revokedAt: specialistClients.revokedAt,
    })
    .from(specialistClients)
    .where(
      and(
        eq(specialistClients.specialistUserId, specialistUserId),
        eq(specialistClients.clientUserId, clientUserId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export type ScopeResult<T> = { ok: true; data: T } | { ok: false; reason: AccessDenial };

/**
 * Открывает клиентские данные в объёме `scope` и записывает это в журнал.
 *
 * `read` вызывается **только** если доступ разрешён. Никакого способа
 * получить данные в обход этой функции быть не должно — именно поэтому она
 * принимает чтение колбэком, а не возвращает разрешение, которое можно
 * проигнорировать.
 *
 * Журнал пишется до чтения, а не после. Чтение может упасть на середине —
 * запрос к базе, отсутствующее фото, что угодно, — и запись «специалист
 * открывал дневник» в этом случае всё равно должна остаться: клиенту важен
 * факт обращения, а не то, чем оно закончилось.
 */
export async function withClientScope<T>(
  specialistUserId: number,
  clientUserId: number,
  scope: AccessScope,
  read: (clientUserId: number) => Promise<T>,
  now: Date = new Date(),
): Promise<ScopeResult<T>> {
  const profile = await getSpecialistProfile(specialistUserId);
  const link = await getLink(specialistUserId, clientUserId);

  const decision = canAccess({
    specialistUserId,
    clientUserId,
    status: profile?.status ?? null,
    link,
    scope,
    now,
  });
  if (!decision.allowed) return { ok: false, reason: decision.reason };

  // Журнал — не побочный эффект чтения, а его часть. Если запись не удалась,
  // читать не начинаем: непрозрачное чтение хуже отказа.
  await getDb().insert(specialistAccessLog).values({ specialistUserId, clientUserId, scope, at: now });

  return { ok: true, data: await read(clientUserId) };
}
