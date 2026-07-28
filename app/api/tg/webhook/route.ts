import { timingSafeEqual } from "node:crypto";
import { handleUpdate } from "@/lib/bot/handle-update";
import { botLinks } from "@/lib/bot/links";
import { botStore } from "@/lib/bot/store";
import { botToken, createTelegramClient, type TelegramUpdate } from "@/lib/telegram-api";

/**
 * Вебхук Telegram. Отдельного процесса для бота нет намеренно: long polling
 * потребовал бы второй контейнер и постоянно живущее соединение, а Caddy
 * перед приложением уже терминирует TLS — Telegram может стучаться прямо
 * сюда. На VPS с 1 ГБ это экономит целый сервис.
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
    now: new Date(),
    links: botLinks(),
  });

  return new Response("ok");
}
