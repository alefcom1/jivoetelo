/**
 * Состояние бота в базе. Правила и вердикт — в lib/bot/health.ts, там чисто.
 *
 * ## Почему база, а не память процесса
 *
 * Сначала было в памяти, и это выглядело очевидно правильным: цикл опроса и
 * страница админки живут в одном процессе Node, значит и модуль у них один.
 *
 * Оказалось — нет. Цикл поднимает `instrumentation.ts`, страницу рендерит
 * серверный компонент, и Next собирает их в разные бандлы: `chunks/lib_*` и
 * `chunks/ssr/[root-of-the-server]_*`. Модуль состояния попал в оба, инстанса
 * получилось два, и страница читала бы собственную нетронутую копию — то есть
 * бодро сообщала бы «бот не запускался» при работающем боте.
 *
 * Это поймано чтением собранных чанков до того, как страницей воспользовались.
 * Урок общий: разделяемое состояние между инструментацией и страницами в Next
 * держать в памяти нельзя, сколько бы один процесс их ни исполнял.
 *
 * ## Почему запись не на каждый опрос
 *
 * Длинный запрос возвращается каждые 25 секунд, и писать на каждый — три с
 * половиной тысячи UPDATE в сутки ради поля, которое читают раз в месяц.
 * Раз в минуту достаточно: порог «застрял» — три минуты.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import type { BotState, BotTransportMode } from "./health.ts";

/** Не чаще раза в минуту — см. рассуждение выше. */
const WRITE_EVERY_MS = 60_000;
let lastWriteAt = 0;

type Row = {
  transport: string | null;
  started_at: Date | null;
  last_poll_at: Date | null;
  last_update_at: Date | null;
  last_error: string | null;
  last_error_at: Date | null;
  not_started_reason: string | null;
};

/**
 * Отметка о запуске. Пишется всегда, без оглядки на частоту: это событие, а не
 * сердцебиение, и происходит оно раз за жизнь процесса.
 *
 * Никогда не бросает. Бот, не поднявшийся из-за недоступной базы, — куда
 * худший исход, чем ненаписанная строчка диагностики.
 */
export async function recordBotStart(transport: BotTransportMode): Promise<void> {
  await write({
    transport,
    started_at: new Date(),
    last_poll_at: null,
    last_update_at: null,
    not_started_reason: null,
  });
}

export async function recordBotNotStarted(reason: string): Promise<void> {
  await write({ transport: null, started_at: new Date(), not_started_reason: reason });
}

/** Сердцебиение. Тихо пропускается, если с прошлой записи не прошло минуты. */
export async function recordPoll(updates: number, now = Date.now()): Promise<void> {
  if (now - lastWriteAt < WRITE_EVERY_MS && updates === 0) return;
  lastWriteAt = now;
  await write({
    last_poll_at: new Date(now),
    ...(updates > 0 ? { last_update_at: new Date(now) } : {}),
  });
}

export async function recordBotError(message: string): Promise<void> {
  await write({ last_error: message.slice(0, 500), last_error_at: new Date() });
}

/** Состояние для страницы админки. Нет строки — значит бот ещё не отмечался. */
export async function readBotHealth(): Promise<Pick<
  BotState,
  "transport" | "startedAt" | "lastPollAt" | "lastUpdateAt" | "lastError" | "notStartedReason"
> | null> {
  try {
    const result = (await getDb().execute(
      sql`SELECT transport, started_at, last_poll_at, last_update_at, last_error, last_error_at, not_started_reason
            FROM bot_health WHERE id = 1`,
    )) as unknown as { rows: Row[] };
    const row = result.rows?.[0];
    if (!row) return null;

    return {
      transport: row.transport === "polling" || row.transport === "webhook" ? row.transport : null,
      startedAt: row.started_at,
      lastPollAt: row.last_poll_at,
      lastUpdateAt: row.last_update_at,
      lastError: row.last_error && row.last_error_at ? { at: row.last_error_at, message: row.last_error } : null,
      notStartedReason: row.not_started_reason,
    };
  } catch (error) {
    console.error("bot health read failed", error);
    return null;
  }
}

/**
 * Обновляет единственную строку, создавая её при первом обращении.
 *
 * `COALESCE(EXCLUDED.x, bot_health.x)` — чтобы частичная запись не стирала
 * соседние поля: сердцебиение не должно затирать причину отказа, а ошибка —
 * время запуска.
 */
async function write(patch: Partial<Row>): Promise<void> {
  try {
    const v = (key: keyof Row) => (key in patch ? (patch[key] ?? null) : null);
    await getDb().execute(sql`
      INSERT INTO bot_health (id, transport, started_at, last_poll_at, last_update_at, last_error, last_error_at, not_started_reason, updated_at)
      VALUES (1, ${v("transport")}, ${v("started_at")}, ${v("last_poll_at")}, ${v("last_update_at")},
              ${v("last_error")}, ${v("last_error_at")}, ${v("not_started_reason")}, now())
      ON CONFLICT (id) DO UPDATE SET
        transport = COALESCE(EXCLUDED.transport, bot_health.transport),
        started_at = COALESCE(EXCLUDED.started_at, bot_health.started_at),
        last_poll_at = COALESCE(EXCLUDED.last_poll_at, bot_health.last_poll_at),
        last_update_at = COALESCE(EXCLUDED.last_update_at, bot_health.last_update_at),
        last_error = COALESCE(EXCLUDED.last_error, bot_health.last_error),
        last_error_at = COALESCE(EXCLUDED.last_error_at, bot_health.last_error_at),
        -- Единственное поле, которое обязано затираться: успешный старт после
        -- неудачного должен снять прежнюю причину, иначе она висит вечно.
        not_started_reason = CASE
          WHEN EXCLUDED.started_at IS NOT NULL THEN EXCLUDED.not_started_reason
          ELSE bot_health.not_started_reason
        END,
        updated_at = now()
    `);
  } catch (error) {
    console.error("bot health write failed", error);
  }
}
