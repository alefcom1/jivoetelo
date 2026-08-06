import { timingSafeEqual } from "node:crypto";
import { handleUpdate } from "@/lib/bot/handle-update";
import { botLinks } from "@/lib/bot/links";
import { botStore, botTranscriber } from "@/lib/bot/store";
import { paymentsEnabled } from "@/lib/payments/config";
import { botToken, createTelegramClient, type TelegramUpdate } from "@/lib/telegram-api";

/**
 * Вебхук Telegram — один из двух транспортов бота (второй, забор сообщений
 * через getUpdates, живёт в lib/bot/polling.ts; выбор — в
 * lib/bot/transport.ts).
 *
 * Здесь раньше стояло утверждение, что long polling «потребовал бы второй
 * контейнер», и потому вебхук единственно верен. Первое оказалось неверным
 * (цикл живёт в том же процессе, что и планировщик), а второе — неприменимым
 * на боевом сервере: до российского VPS Telegram не достучался вовсе,
 * `getWebhookInfo` показывал `Connection timed out` при работающем сайте.
 *
 * Маршрут остаётся: там, где Telegram до приложения дотягивается, вебхук
 * дешевле и не держит постоянного соединения.
 *
 * Адрес вебхука знает только Telegram, но полагаться на это нельзя: секрет в
 * заголовке — единственное, что отличает настоящий апдейт от подделки.
 */

function secretMatches(received: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // timingSafeEqual требует одинаковой длины, и сама проверка длины уже
  // утечка — но длина секрета не тайна, в отличие от его содержимого.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const token = botToken();
  if (!token || !process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("bot is not configured", { status: 503 });
  }

  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("forbidden", { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    // Отвечаем 200: повторная доставка нечитаемого тела ничего не изменит.
    return new Response("ok");
  }

  await handleUpdate(update, {
    client: createTelegramClient(token),
    store: botStore,
    transcribe: botTranscriber(),
    now: new Date(),
    links: botLinks(),
    paymentsEnabled: paymentsEnabled(),
  });

  return new Response("ok");
}
