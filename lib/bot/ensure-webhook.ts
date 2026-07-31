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
 * Идемпотентно, но безусловно: регистрируем при каждом старте, даже если
 * адрес не менялся. `getWebhookInfo` не возвращает секрет, и «пропустить,
 * раз адрес тот же» означало бы не заметить разошедшийся секрет — а это
 * отказ без единой строки в логе.
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

type WebhookInfo = { url?: string; last_error_message?: string; pending_update_count?: number };

/**
 * Ответ Telegram на неудачную доставку — одна строка, и по ней почти всегда
 * видно, что чинить. Пересказываем её действием, а не кодом. Те же правила,
 * что в scripts/webhook.mjs: держим рядом с местом, где строка появляется.
 */
function explainDeliveryError(message: string): string {
  if (/503/.test(message)) return "маршрут вебхука отвечает 503 — на сервере пуст TELEGRAM_WEBHOOK_SECRET.";
  if (/403/.test(message)) return "секрет вебхука и секрет приложения разные — эта регистрация их снова сведёт.";
  if (/404/.test(message)) return "приложение не отдаёт /api/tg/webhook — проверьте, что за SITE_URL стоит именно оно.";
  if (/[Ss][Ss][Ll]|certificate/.test(message)) return "проблема с сертификатом домена, Telegram требует валидный TLS.";
  if (/[Tt]imeout|unreachable|[Cc]onnection/.test(message)) return "Telegram не достучался до сайта: домен не резолвится снаружи или приложение лежало.";
  return "разберите текст ошибки выше — Telegram пишет причину прямым текстом.";
}

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
    // Что Telegram думает о прошлой доставке — самая полезная строка при
    // разборе «бот молчит», и она уже есть в этом ответе. Пишем её в лог до
    // того, как что-то менять.
    const info = await client.call<WebhookInfo>("getWebhookInfo", {});
    if (info?.last_error_message) {
      console.warn(`[bot] последняя ошибка доставки: ${info.last_error_message}`);
      console.warn(`[bot] ${explainDeliveryError(info.last_error_message)}`);
    }
    if ((info?.pending_update_count ?? 0) > 0) {
      console.warn(`[bot] в очереди Telegram ${info.pending_update_count} недоставленных сообщений`);
    }

    // Регистрируем всегда, даже если адрес тот же.
    //
    // Соблазн пропустить при совпадении адреса выглядит разумно, но создаёт
    // ловушку без выхода: getWebhookInfo **не возвращает секрет**. Если
    // TELEGRAM_WEBHOOK_SECRET в .env разошёлся с тем, что зарегистрировано,
    // адрес совпадает, перерегистрацию мы пропускаем, Telegram продолжает
    // слать старый секрет, приложение отвечает 403 — и бот молчит навсегда,
    // причём в логе приложения при этом пусто. Один лишний запрос на старте
    // стоит дешевле, чем этот класс отказов.
    await client.call("setWebhook", {
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      // Накопившееся за время простоя не разбираем: это чаще всего дубли
      // того, что человек уже прислал заново.
      drop_pending_updates: true,
    });
    console.log(`[bot] вебхук зарегистрирован: ${webhookUrl}`);

    await ensureBotProfile();
  } catch (error) {
    console.error("[bot] не удалось настроить вебхук — бот отвечать не будет:", error);
  }
}

/**
 * Команды и кнопка Mini App — то, что нужно выставить независимо от
 * транспорта. При опросе вебхука нет вовсе, но меню бота всё равно должно
 * быть настроено.
 *
 * Выставляем при каждом старте, а не только вместе с вебхуком. Иначе
 * получается ловушка: домен привязали в BotFather уже после первой выкатки,
 * приложение перезапустили — а кнопка не появилась. Оба вызова идемпотентны
 * и стоят одного запроса.
 */
export async function ensureBotProfile(): Promise<void> {
  const token = botToken();
  if (!token) return;
  const client = createTelegramClient(token);

  try {
    await client.call("setMyCommands", { commands: COMMANDS });
  } catch (error) {
    console.warn("[bot] команды задать не удалось:", error instanceof Error ? error.message : error);
  }

  // Telegram отклоняет web_app с непривязанным доменом — это отдельная
  // настройка в BotFather (/setdomain), и её отсутствие не повод считать
  // выкатку неудачной.
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
}
