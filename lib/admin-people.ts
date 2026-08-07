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
import { estimateCostUsd, type AiOperation } from "./quota-policy.ts";
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
    plan: effectivePlan(row.accessUntil, row.createdAt, new Date()),
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

export type TimelineEvent = {
  at: Date;
  /** Раздел: по нему в интерфейсе красится метка и фильтруется лента. */
  kind: string;
  /** Что именно произошло, готовой строкой. */
  detail: string;
};

/**
 * Всё, что сервис записал про человека, одной лентой.
 *
 * ## Почему UNION, а не десять запросов
 *
 * События живут в десяти таблицах, и до сих пор карточка показывала из них
 * две — приёмы пищи и награды. На вопрос «что этот человек делал» это не
 * отвечало: заходы, обращения к распознаванию, согласия, вес, снимки, письма
 * оставались невидимы, хотя записаны все. Собирать их в приложении значило бы
 * вытянуть по сотне строк из каждой таблицы и отсортировать в памяти, чтобы
 * показать двадцать; база сливает и сортирует это одним проходом.
 *
 * ## Чего в ленте нет и почему
 *
 * Нет просмотров страниц: мы их не пишем. Это не упущение — дневник питания
 * не то место, где стоит заводить полную слежку за перемещениями по экранам,
 * а на вопросы «пользуется ли человек сервисом» и «что у него не получилось»
 * отвечают записи о действиях, которые здесь и собраны.
 *
 * Нет содержимого писем и снимков — только факт отправки и заголовок. Сами
 * данные лежат по своим адресам, и дублировать их в ленте незачем.
 *
 * Обращение к ленте пишется в журнал как `diary`: это чтение персональных
 * данных, и след ему нужен такой же, как открытию карточки.
 */
export async function personTimeline(personId: number, limit = 200): Promise<TimelineEvent[]> {
  const rows = await getDb().execute(sql`
    SELECT at, kind, detail FROM (
      SELECT created_at AS at, 'meal' AS kind,
             coalesce(source_text, 'без описания') || ' · ' || eaten_on || ' ' || eaten_time AS detail
        FROM meals WHERE user_id = ${personId}
      UNION ALL
      SELECT created_at, 'weight', on_date || ' · ' || weight_kg || ' кг'
        FROM weight_entries WHERE user_id = ${personId}
      UNION ALL
      SELECT created_at, 'ai',
             kind || ' · ' || input_tokens || '→' || output_tokens || ' токенов'
        FROM ai_usage WHERE user_id = ${personId}
      UNION ALL
      SELECT created_at, 'award', award_key || ' · ' || earned_on
        FROM user_awards WHERE user_id = ${personId}
      UNION ALL
      SELECT accepted_at, 'consent',
             kind || ' ' || version || ' (' || source || ')'
             || CASE WHEN withdrawn_at IS NULL THEN '' ELSE ' — отозвано' END
        FROM user_consents WHERE user_id = ${personId}
      UNION ALL
      SELECT created_at, 'session', 'вход в аккаунт'
        FROM sessions WHERE user_id = ${personId}
      UNION ALL
      SELECT created_at, 'photo', coalesce(note, 'снимок без подписи')
        FROM photo_inbox WHERE user_id = ${personId}
      UNION ALL
      SELECT created_at, 'catalog', product_slug || ' · ' || status
        FROM catalog_photos WHERE user_id = ${personId}
      UNION ALL
      SELECT created_at, 'payment', status || ' · ' || sum
        FROM payments WHERE user_id = ${personId}
      UNION ALL
      SELECT used_at, 'voucher', code || ' · ' || days || ' дн.'
        FROM vouchers WHERE used_by = ${personId} AND used_at IS NOT NULL
      UNION ALL
      SELECT sent_at, 'report', kind || ' · ' || channel
        FROM report_deliveries WHERE user_id = ${personId} AND sent_at IS NOT NULL
    ) events
    ORDER BY at DESC
    LIMIT ${limit}
  `);
  const list = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
  return (list as Array<{ at: string | Date; kind: string; detail: string }>).map((row) => ({
    at: row.at instanceof Date ? row.at : new Date(row.at),
    kind: String(row.kind),
    detail: String(row.detail),
  }));
}

export type PersonDailySpend = { day: string; calls: number; costUsd: number };

/**
 * Расход на распознавание по дням — для одного человека.
 *
 * Тот же разрез, что и на странице расхода, но в карточке он отвечает на
 * другой вопрос: не «сколько стоит сервис», а «сколько стоит этот человек» —
 * тот самый, с которым сейчас разбираешься. Без него разговор о переводе на
 * платный тариф ведётся вслепую.
 */
export async function personSpendByDay(personId: number, days = 30): Promise<PersonDailySpend[]> {
  const result = await getDb().execute(sql`
    SELECT on_date::text AS day, kind,
           count(*)::int AS calls,
           coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
           coalesce(sum(output_tokens), 0)::bigint AS output_tokens
    FROM ai_usage
    WHERE user_id = ${personId} AND on_date >= current_date - ${days - 1}::int
    GROUP BY on_date, kind
    ORDER BY on_date DESC
  `);
  const list = (result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[]);
  const byDay = new Map<string, PersonDailySpend>();
  for (const row of list as Array<Record<string, string | number>>) {
    const day = String(row.day);
    const entry = byDay.get(day) ?? { day, calls: 0, costUsd: 0 };
    byDay.set(day, entry);
    entry.calls += Number(row.calls);
    entry.costUsd += estimateCostUsd(
      { inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens) },
      String(row.kind) as AiOperation,
    );
  }
  return [...byDay.values()];
}

/**
 * Найти человека по точному совпадению почты или номера.
 *
 * Отдельно от `listPeople`, который ищет подстрокой: там результат
 * показывается списком и выбирает человек, здесь — сразу приводит к действию
 * с деньгами. «Нашлось двое, взяли первого» стоило бы кому-то оплаченного
 * месяца, поэтому неоднозначность считается ненайденным.
 */
export async function findPersonExactly(query: string): Promise<number | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const asId = Number(trimmed);
  if (Number.isInteger(asId) && asId > 0) {
    const rows = await getDb().select({ id: users.id }).from(users).where(eq(users.id, asId)).limit(1);
    return rows[0]?.id ?? null;
  }

  const rows = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${trimmed.toLowerCase()}`)
    .limit(2);
  return rows.length === 1 ? rows[0].id : null;
}
