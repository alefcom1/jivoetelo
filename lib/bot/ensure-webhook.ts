/**
 * Регистрация вебхука при старте приложения.
 *
 * Раньше это был ручной шаг из инструкции: зайти на сервер и выполнить
 * `node scripts/webhook.mjs set`. Проблема ручного шага в том, что о нём
 * забывают навсегда — код обновляется сам при каждой выкатке, а Telegram
 * по-прежнему не знает, куда слать сообщения. Со стороны это выглядит как
 * «бот пустой, ничего не отвечает», и причина совершенно не очевидна:
 * приложение работает, сайт открывается, ошибок нигде нет.
 *
 * Почему именно здесь, а не в скрипте выкатки. На хосте может не быть Node
 * вовсе (миграции и те идут через `docker compose exec`), а в образе нет
 * каталога `scripts/` — сборка standalone кладёт только то, что нужно
 * приложению. Единственное место, где гарантированно есть и Node, и токен,
 * и адрес сайта, и настройки прокси к Bot API, — само приложение.
 *
 * Идемпотентно: сначала спрашиваем Telegram, что у него записано, и молчим,
 * если адрес уже верный. Так перезапуск контейнера не превращается в поток
 * лишних запросов.
 */

import { botLinks } from "./links.ts";
import { absoluteUrl } from "../site.ts";
import { botToken, createTelegramClient } from "../telegram-api.ts";

const COMMANDS = [
  { command: "start", description: "Как всё устроено" },
  { command: "app", description: "Открыть дневник" },
  { command: "help", description: "Что я умею" },
  { command: "stop", description: "Выключить напоминания" },
];

type WebhookInfo = { url?: string };

/**
 * Приводит настройки бота в Telegram к тому, что описано в коде.
 *
 * Никогда не бросает: бот — не то, ради чего стоит не поднять приложение.
 * Все отказы уходят в лог понятным текстом.
 */
export async function ensureWebhook(): Promise<void> {
  const token = botToken();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  if (!token) return;
  if (!secret) {
    console.warn("[bot] TELEGRAM_WEBHOOK_SECRET не задан — вебхук не регистрирую, бот отвечать не будет.");
    return;
  }

  const webhookUrl = absoluteUrl("/api/tg/webhook");
  if (!webhookUrl.startsWith("https://")) {
    console.warn(`[bot] SITE_URL не https (${webhookUrl}) — Telegram такой вебхук не примет.`);
    return;
  }

  const client = createTelegramClient(token);

  try {
    const info = await client.call<WebhookInfo>("getWebhookInfo", {});
    if (info?.url === webhookUrl) {
      console.log("[bot] вебхук уже на месте");
      return;
    }

    await client.call("setWebhook", {
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      // Накопившееся за время простоя не разбираем: это чаще всего дубли
      // того, что человек уже прислал заново.
      drop_pending_updates: true,
    });
    console.log(`[bot] вебхук зарегистрирован: ${webhookUrl}`);

    await client.call("setMyCommands", { commands: COMMANDS });

    // Синяя кнопка «Дневник» рядом со строкой ввода. Telegram отклоняет
    // web_app с непривязанным доменом — это отдельная настройка в BotFather
    // (/setdomain), и её отсутствие не повод считать выкатку неудачной.
    const miniAppUrl = botLinks().miniAppUrl ?? absoluteUrl("/tg");
    try {
      await client.call("setChatMenuButton", {
        menu_button: { type: "web_app", text: "Дневник", web_app: { url: miniAppUrl } },
      });
    } catch (error) {
      console.warn(
        `[bot] кнопку Mini App поставить не удалось (${error instanceof Error ? error.message : error}). ` +
          "Обычно это значит, что домен не привязан к боту: @BotFather → /setdomain.",
      );
    }
  } catch (error) {
    console.error("[bot] не удалось настроить вебхук — бот отвечать не будет:", error);
  }
}
