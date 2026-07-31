/**
 * Каким способом бот получает сообщения: вебхуком или опросом.
 *
 * Умолчание выведено из наблюдения, а не из вкуса: **если для исходящих
 * запросов к Bot API нужен прокси, то и входящие до нас, скорее всего, не
 * дойдут.** Блокировка симметрична. Именно так и оказалось на боевом
 * сервере: вебхук зарегистрирован, `ip_address` определён, а
 * `last_error_message` — `Connection timed out`, при том что сайт открыт и
 * Mini App работает.
 *
 * Поэтому: задан `TELEGRAM_API_BASE` (то есть мы за прокси) — опрашиваем
 * сами; не задан — верим вебхуку, он дешевле и не держит соединение.
 * Переопределяется явно через `TELEGRAM_BOT_TRANSPORT`.
 */

export type BotTransport = "webhook" | "polling";

export function botTransport(): BotTransport {
  const forced = process.env.TELEGRAM_BOT_TRANSPORT?.trim().toLowerCase();
  if (forced === "polling" || forced === "webhook") return forced;

  const proxied = (process.env.TELEGRAM_API_BASE ?? "").trim();
  // Пустая строка и сам api.telegram.org — это «прокси нет».
  const behindProxy = proxied.length > 0 && !proxied.includes("api.telegram.org");
  return behindProxy ? "polling" : "webhook";
}
