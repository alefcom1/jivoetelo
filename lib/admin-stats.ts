/**
 * Сводные цифры для админки.
 *
 * ## Что здесь есть и чего нет
 *
 * Нет «всего пользователей» крупным шрифтом. Это витрина тщеславия: число
 * растёт само собой, ни на одно решение не влияет и проверяется один раз.
 *
 * Есть удержание. Для дневника питания это и есть продукт: сервисом
 * пользуются или не пользуются на второй неделе, а не в день регистрации.
 * И есть расход на распознавание в деньгах — без него нельзя назначить цену,
 * потому что неизвестна себестоимость активного человека.
 *
 * ## Почему всё считает база
 *
 * Каждый запрос здесь — одна агрегатная выборка. Вытянуть таблицы в
 * приложение и посчитать в коде было бы проще писать и невозможно
 * эксплуатировать: на десяти тысячах человек это десятки мегабайт на каждое
 * открытие страницы.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { estimateCostUsd, type AiOperation } from "./quota-policy.ts";

/**
 * Строки из сырого запроса.
 *
 * `execute` возвращает результат драйвера, а не массив: строки лежат в
 * `rows` (так же читают их lib/barcode-store.ts и lib/scheduler.ts). Обёртка
 * одна на модуль, потому что запросов здесь восемь, и приводить тип по месту
 * означало бы восемь возможностей ошибиться одинаково.
 */
async function rowsOf<T>(query: Parameters<ReturnType<typeof getDb>["execute"]>[0]): Promise<T[]> {
  const result = await getDb().execute(query);
  return ((result as { rows?: unknown[] }).rows ?? []) as T[];
}

export type DailyPoint = { day: string; count: number };

/** Регистрации по дням за последние `days` дней, включая нули. */
export async function registrationsByDay(days = 30): Promise<DailyPoint[]> {
  const rows = await rowsOf<Record<string, string | number>>(sql`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(u.id)::int AS count
    FROM generate_series(current_date - ${days - 1}::int, current_date, interval '1 day') AS d(day)
    LEFT JOIN users u ON u.created_at::date = d.day
    GROUP BY d.day
    ORDER BY d.day
  `);
  return (rows as Array<{ day: string; count: number }>).map((row) => ({
    day: row.day,
    count: Number(row.count),
  }));
}

export type SourceBreakdown = { web: number; telegram: number; invited: number };

/**
 * Откуда пришли.
 *
 * «Телеграм» — аккаунт без почты: такие заводятся только в Mini App.
 * «По приглашению» пересекается с обеими: это не третий источник, а признак,
 * и в интерфейсе он подписан отдельно.
 */
export async function registrationSources(days = 30): Promise<SourceBreakdown> {
  const rows = await rowsOf<Record<string, string | number>>(sql`
    SELECT
      count(*) FILTER (WHERE email IS NOT NULL)::int AS web,
      count(*) FILTER (WHERE email IS NULL)::int AS telegram,
      count(*) FILTER (WHERE invited_by IS NOT NULL)::int AS invited
    FROM users
    WHERE created_at >= current_date - ${days - 1}::int
  `);
  const row = rows[0] ?? {};
  return { web: Number(row.web ?? 0), telegram: Number(row.telegram ?? 0), invited: Number(row.invited ?? 0) };
}

export type RetentionPoint = { day: number; cohort: number; returned: number; share: number };

/**
 * Удержание: доля зарегистрировавшихся, у кого есть запись на N-й день и позже.
 *
 * Считается «дожил до дня N», а не «записал ровно в день N»: дневник ведут не
 * по будильнику, и требовать записи именно на седьмые сутки значило бы мерить
 * аккуратность, а не пользование.
 *
 * В когорту идут только те, кто зарегистрировался достаточно давно, чтобы
 * успеть дожить: иначе вчерашние регистрации занижали бы удержание на 30-й
 * день до нуля просто потому, что тридцати дней ещё не прошло.
 */
export async function retention(days: readonly number[] = [1, 7, 30]): Promise<RetentionPoint[]> {
  const out: RetentionPoint[] = [];
  for (const day of days) {
    const rows = await rowsOf<Record<string, string | number>>(sql`
      WITH cohort AS (
        SELECT id, created_at FROM users
        WHERE created_at <= now() - ${day}::int * interval '1 day'
      )
      SELECT
        (SELECT count(*)::int FROM cohort) AS cohort,
        (SELECT count(DISTINCT m.user_id)::int
           FROM meals m JOIN cohort c ON c.id = m.user_id
          WHERE m.eaten_on >= (c.created_at + ${day}::int * interval '1 day')::date) AS returned
    `);
    const row = rows[0] ?? {};
    const cohort = Number(row.cohort ?? 0);
    const returned = Number(row.returned ?? 0);
    out.push({ day, cohort, returned, share: cohort > 0 ? returned / cohort : 0 });
  }
  return out;
}

export type Activity = { today: number; week: number; month: number; medianMealsWeek: number };

/** Кто ведёт дневник прямо сейчас. */
export async function activity(): Promise<Activity> {
  // Медиана считается по ЛЮДЯМ, а не по приёмам: подзапрос сначала сводит
  // записи к одной строке на человека. Без этого шага percentile_cont шёл бы
  // по строкам приёмов, и один человек с сорока записями перетягивал бы
  // медиану на себя — то есть отвечал бы за всех.
  const rows = await rowsOf<Record<string, string | number>>(sql`
    WITH per_user AS (
      SELECT user_id, count(*)::int AS cnt
      FROM meals WHERE eaten_on >= current_date - 6
      GROUP BY user_id
    )
    SELECT
      (SELECT count(DISTINCT user_id)::int FROM meals WHERE eaten_on = current_date) AS today,
      (SELECT count(*)::int FROM per_user) AS week,
      (SELECT count(DISTINCT user_id)::int FROM meals WHERE eaten_on >= current_date - 29) AS month,
      coalesce((SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY cnt) FROM per_user), 0) AS median
  `);
  const row = rows[0] ?? {};
  return {
    today: Number(row.today ?? 0),
    week: Number(row.week ?? 0),
    month: Number(row.month ?? 0),
    medianMealsWeek: Math.round(Number(row.median ?? 0)),
  };
}

export type FunnelStep = { key: string; label: string; count: number };

/**
 * Воронка первых шагов: где люди останавливаются.
 *
 * Считается по всем зарегистрированным за всё время, а не за окно: воронка
 * отвечает на вопрос «доходят ли вообще», и окно тут только зашумило бы её
 * теми, кто ещё в пути.
 */
export async function firstStepsFunnel(): Promise<FunnelStep[]> {
  const rows = await rowsOf<Record<string, string | number>>(sql`
    SELECT
      count(*)::int AS registered,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = u.id))::int AS planned,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM meals m WHERE m.user_id = u.id))::int AS logged,
      count(*) FILTER (WHERE (SELECT count(DISTINCT eaten_on) FROM meals m WHERE m.user_id = u.id) >= 7)::int AS week
    FROM users u
  `);
  const row = rows[0] ?? {};
  return [
    { key: "registered", label: "Зарегистрировались", count: Number(row.registered ?? 0) },
    { key: "planned", label: "Настроили план", count: Number(row.planned ?? 0) },
    { key: "logged", label: "Записали первую еду", count: Number(row.logged ?? 0) },
    { key: "week", label: "Дошли до семи дней", count: Number(row.week ?? 0) },
  ];
}

export type AiSpend = { operation: AiOperation; calls: number; costUsd: number };

/**
 * Расход на распознавание за период — по операциям.
 *
 * Это себестоимость, и без неё цену назначать нельзя. Оценка по прейскуранту
 * (estimateCostUsd), то есть заведомо не ниже фактической: предохранитель
 * должен ошибаться в сторону осторожности.
 */
export async function aiSpend(days = 30): Promise<AiSpend[]> {
  const rows = await rowsOf<Record<string, string | number>>(sql`
    SELECT kind, count(*)::int AS calls,
           coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
           coalesce(sum(output_tokens), 0)::bigint AS output_tokens
    FROM ai_usage
    WHERE on_date >= current_date - ${days - 1}::int
    GROUP BY kind
    ORDER BY calls DESC
  `);
  return rows.map((row) => ({
    operation: String(row.kind) as AiOperation,
    calls: Number(row.calls),
    costUsd: estimateCostUsd(
      { inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens) },
      String(row.kind) as AiOperation,
    ),
  }));
}

export type AwardSpread = { key: string; count: number };

/** Сколько людей дошло до каждой награды. То же удержание, но в понятных единицах. */
export async function awardSpread(): Promise<AwardSpread[]> {
  const rows = await rowsOf<Record<string, string | number>>(sql`
    SELECT award_key AS key, count(*)::int AS count
    FROM user_awards GROUP BY award_key ORDER BY count DESC
  `);
  return (rows as Array<{ key: string; count: number }>).map((row) => ({
    key: row.key,
    count: Number(row.count),
  }));
}

export type PaidSummary = { active: number; expiringWeek: number; paidEver: number };

/** Платный доступ: сколько открыт сейчас и у скольких он вот-вот кончится. */
export async function paidSummary(): Promise<PaidSummary> {
  const rows = await rowsOf<Record<string, string | number>>(sql`
    SELECT
      count(*) FILTER (WHERE access_until > now())::int AS active,
      count(*) FILTER (WHERE access_until > now() AND access_until <= now() + interval '7 days')::int AS expiring,
      (SELECT count(DISTINCT user_id)::int FROM payments WHERE status = 'paid') AS paid_ever
    FROM users
  `);
  const row = rows[0] ?? {};
  return {
    active: Number(row.active ?? 0),
    expiringWeek: Number(row.expiring ?? 0),
    paidEver: Number(row.paid_ever ?? 0),
  };
}

/** Стоимость одной операции за период: сколько раз и на сколько долларов. */
export type SpendCell = { operation: AiOperation; calls: number; costUsd: number };

export type DailySpend = { day: string; calls: number; costUsd: number; byOperation: SpendCell[] };

/**
 * Расход по дням.
 *
 * Итог за тридцать дней отвечает на вопрос «сколько стоит сервис вообще», но
 * не отвечает ни на один вопрос, который задают в работе: когда именно
 * подскочило, разовый это выброс или новая норма, окупается ли вчерашний
 * приток людей. Для этого нужен ряд, а не число.
 *
 * Дни без обращений тоже в ряду — `generate_series`. Пропущенный день в
 * таблице читается как «данных нет», хотя означает ровно обратное: сервисом
 * в этот день не пользовались, и это факт, а не пробел.
 */
export async function aiSpendByDay(days = 30): Promise<DailySpend[]> {
  const rows = await rowsOf<Record<string, string | number>>(sql`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, u.kind,
           count(u.id)::int AS calls,
           coalesce(sum(u.input_tokens), 0)::bigint AS input_tokens,
           coalesce(sum(u.output_tokens), 0)::bigint AS output_tokens
    FROM generate_series(current_date - ${days - 1}::int, current_date, interval '1 day') AS d(day)
    LEFT JOIN ai_usage u ON u.on_date = d.day
    GROUP BY d.day, u.kind
    ORDER BY d.day
  `);

  const byDay = new Map<string, DailySpend>();
  for (const row of rows) {
    const day = String(row.day);
    const entry = byDay.get(day) ?? { day, calls: 0, costUsd: 0, byOperation: [] };
    byDay.set(day, entry);
    // LEFT JOIN даёт строку и на день без обращений — с пустым kind. Такой
    // день обязан остаться в ряду нулём, а не превратиться в операцию «null».
    if (row.kind === null || row.kind === undefined) continue;
    const operation = String(row.kind) as AiOperation;
    const costUsd = estimateCostUsd(
      { inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens) },
      operation,
    );
    entry.calls += Number(row.calls);
    entry.costUsd += costUsd;
    entry.byOperation.push({ operation, calls: Number(row.calls), costUsd });
  }
  return [...byDay.values()];
}

export type PersonSpend = {
  userId: number;
  email: string | null;
  calls: number;
  costUsd: number;
  byOperation: SpendCell[];
};

/**
 * Расход по людям.
 *
 * Ради этого разреза раздел и нужен: средняя себестоимость на человека
 * скрывает то, что решает судьбу тарифа, — распределение. Двадцать центов в
 * среднем при одном человеке на четыре доллара и сорока по три цента это
 * совсем другой сервис, чем сорок одинаковых по двадцать центов, и цена у
 * них должна быть разная.
 *
 * Сортировка по расходу, а не по дате: разговор всегда начинается с верхней
 * строки.
 */
export async function aiSpendByUser(days = 30, limit = 100): Promise<PersonSpend[]> {
  const rows = await rowsOf<Record<string, string | number | null>>(sql`
    SELECT a.user_id, u.email, a.kind,
           count(*)::int AS calls,
           coalesce(sum(a.input_tokens), 0)::bigint AS input_tokens,
           coalesce(sum(a.output_tokens), 0)::bigint AS output_tokens
    FROM ai_usage a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.on_date >= current_date - ${days - 1}::int
    GROUP BY a.user_id, u.email, a.kind
  `);

  const byUser = new Map<number, PersonSpend>();
  for (const row of rows) {
    const userId = Number(row.user_id);
    const entry = byUser.get(userId)
      ?? { userId, email: (row.email as string | null) ?? null, calls: 0, costUsd: 0, byOperation: [] };
    byUser.set(userId, entry);
    const operation = String(row.kind) as AiOperation;
    const costUsd = estimateCostUsd(
      { inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens) },
      operation,
    );
    entry.calls += Number(row.calls);
    entry.costUsd += costUsd;
    entry.byOperation.push({ operation, calls: Number(row.calls), costUsd });
  }
  return [...byUser.values()].sort((a, b) => b.costUsd - a.costUsd).slice(0, limit);
}
