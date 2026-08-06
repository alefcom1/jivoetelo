/**
 * Забор сообщений через getUpdates — запасной транспорт для бота.
 *
 * Почему он понадобился. Вебхук требует, чтобы Telegram сам достучался до
 * сайта. С российского VPS это не работает в обе стороны: наружу
 * `api.telegram.org` не отвечает (для этого у нас прокси, docs/ai-proxy.md),
 * а внутрь Telegram получает `Connection timed out` — сайт при этом
 * открывается и Mini App работает, потому что до них ходят из России.
 * Диагноз виден в `getWebhookInfo`: `url` записан, `ip_address` определён,
 * а `last_error_message` — таймаут соединения.
 *
 * Комментарий в app/api/tg/webhook/route.ts утверждал обратное: «long
 * polling потребовал бы второй контейнер и постоянно живущее соединение».
 * Второй контейнер не нужен — цикл живёт в том же процессе, что и
 * планировщик писем, ровно на тех же основаниях. А постоянное соединение
 * идёт через тот же прокси, что и остальные вызовы Bot API, и это
 * единственный канал, который в этой сети вообще работает.
 *
 * Вебхук из кода не убран: если приложение однажды переедет туда, где
 * Telegram до него дотягивается, он снова станет предпочтительным —
 * дешевле и без постоянного соединения.
 */

import { networkDetail } from "../ai/failure.ts";
import { handleUpdate } from "./handle-update.ts";
import { botLinks } from "./links.ts";
import { botStore, botTranscriber } from "./store.ts";
import { paymentsEnabled } from "../payments/config.ts";
import { ALLOWED_UPDATES } from "./ensure-webhook.ts";
import { botToken, createTelegramClient, type TelegramUpdate } from "../telegram-api.ts";

/**
 * Сколько Telegram держит соединение, если сообщений нет. Меньше, чем
 * типичный потолок прокси на висящий запрос, и меньше, чем время до
 * следующей попытки при обрыве.
 */
const LONG_POLL_SECONDS = 25;

/** Пауза после сбоя. Растёт до минуты, чтобы не долбить недоступный API. */
const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

let started = false;

type PollResult = Array<TelegramUpdate & { update_id?: number }>;

/**
 * Запускает бесконечный цикл забора сообщений. Вызывать один раз при старте
 * процесса; повторные вызовы игнорируются.
 *
 * Оговорка та же, что у планировщика в instrumentation.ts: это работает,
 * пока приложение живёт в одном экземпляре. Два процесса с getUpdates по
 * одному токену будут отбирать сообщения друг у друга — Telegram отдаёт
 * каждое ровно один раз.
 */
export function startPolling(): void {
  if (started) return;
  const token = botToken();
  if (!token) return;
  started = true;

  const client = createTelegramClient(token);
  let offset = 0;
  let backoff = MIN_BACKOFF_MS;

  async function loop(): Promise<void> {
    // Вебхук и getUpdates взаимно исключают друг друга: пока вебхук
    // зарегистрирован, Telegram отвечает на getUpdates ошибкой 409.
    try {
      await client.call("deleteWebhook", { drop_pending_updates: false });
      console.log("[bot] режим забора сообщений: вебхук снят, слушаю getUpdates");
    } catch (error) {
      console.error("[bot] не удалось снять вебхук перед опросом:", error);
    }

    for (;;) {
      try {
        const updates = await client.call<PollResult>("getUpdates", {
          offset,
          timeout: LONG_POLL_SECONDS,
          allowed_updates: ALLOWED_UPDATES,
        });
        backoff = MIN_BACKOFF_MS;

        for (const update of updates ?? []) {
          // Сдвигаем offset до обработки: упавший на одном сообщении бот не
          // должен получать его снова и снова. handleUpdate и сам не бросает,
          // но порядок здесь важнее перестраховки.
          if (typeof update.update_id === "number") offset = update.update_id + 1;
          await handleUpdate(update, {
            client,
            store: botStore,
            transcribe: botTranscriber(),
            now: new Date(),
            links: botLinks(),
            paymentsEnabled: paymentsEnabled(),
          });
        }
      } catch (error) {
        // Обрыв висящего соединения — обычное дело для длинного опроса, и в
        // лог это писать незачем. Всё остальное показываем.
        // Причину берём из глубины цепочки `cause` (lib/ai/failure.ts): у
        // undici верхний уровень всегда «fetch failed», и по такому логу
        // недоступный прокси не отличить от сбоя DNS или сертификата.
        const message = error instanceof Error ? error.message : String(error);
        if (!/timeout|aborted|socket|ECONNRESET/i.test(message)) {
          console.error(`[bot] опрос сорвался: ${message}${networkDetail(error)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
  }

  void loop();
}
