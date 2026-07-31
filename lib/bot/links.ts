/**
 * Куда ведёт кнопка «Разобрать» под сообщениями бота.
 *
 * По умолчанию — на веб-страницу инбокса: такая кнопка работает всегда, но
 * открывает браузер, где человек может оказаться не залогинен. Если Mini App
 * уже заведено в BotFather и его адрес указан в `TELEGRAM_MINIAPP_URL`, кнопка
 * открывает инбокс прямо в Telegram — там вход по подписи initData, без пароля.
 *
 * Переменную нельзя выставлять «на всякий случай»: Telegram отвергает
 * web_app-кнопку с чужим доменом, и тогда сообщение не уйдёт вовсе.
 */

import { absoluteUrl } from "../site.ts";
import type { InlineKeyboardButton } from "../telegram-api.ts";

export type BotLinks = {
  inboxUrl: string;
  miniAppUrl: string | null;
};

export function botLinks(): BotLinks {
  return {
    inboxUrl: absoluteUrl("/app/inbox"),
    miniAppUrl: process.env.TELEGRAM_MINIAPP_URL?.trim() || null,
  };
}

export function inboxButton(links: BotLinks): InlineKeyboardButton {
  return links.miniAppUrl
    ? { text: "Разобрать", web_app: { url: links.miniAppUrl } }
    : { text: "Разобрать", url: links.inboxUrl };
}

/**
 * То же место, но под приветствием: разбирать там ещё нечего, а «Разобрать»
 * на пустом инбоксе обещает работу, которой нет.
 */
export function openAppButton(links: BotLinks): InlineKeyboardButton {
  return links.miniAppUrl
    ? { text: "Открыть дневник", web_app: { url: links.miniAppUrl } }
    : { text: "Открыть дневник", url: links.inboxUrl };
}
