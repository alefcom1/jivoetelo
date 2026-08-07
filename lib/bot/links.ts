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
 *
 * Это предупреждение стояло здесь с самого начала — и всё равно сбылось,
 * причём в худшем виде. В переменную попало её собственное имя:
 * `TELEGRAM_MINIAPP_URL=https://jivoetelo.ru/tg` целиком, вместе с «именем =».
 * Так выходит, когда в поле значения вставляют строку из .env, а не значение.
 * Telegram отверг кнопку, а вместе с ней и всё сообщение — и бот перестал
 * отвечать на `/start` вовсе, потому что приветствие эту кнопку и несёт.
 *
 * Отсюда правило: **негодный адрес выключает кнопку, а не сообщение.** Кнопка
 * — удобство, приветствие — то, ради чего человек написал боту.
 */

import { absoluteUrl } from "../site.ts";
import type { InlineKeyboardButton } from "../telegram-api.ts";
import { reportBotProblem } from "./health.ts";

export type BotLinks = {
  inboxUrl: string;
  miniAppUrl: string | null;
  /** Публичный расчёт — единственное, что можно предложить незнакомому человеку. */
  planUrl: string;
  /** Страница тарифа: туда ведёт кнопка оплаты, когда приём денег включён. */
  premiumUrl: string;
  /** Страница блюда в справочнике — адрес результата инлайн-поиска. */
  dishUrl: (slug: string) => string;
};

/**
 * Адрес Mini App — или ничего, если в переменной лежит не адрес.
 *
 * Проверяем именно здесь, а не полагаемся на Telegram: его отказ стоит целого
 * сообщения, а наш — только кнопки. Требуем https — web_app другого протокола
 * Telegram не принимает, и «http://» с локальной машины прошёл бы проверку
 * `new URL`, но не прошёл бы отправку.
 */
let miniAppComplaint: string | null = null;

export function miniAppUrl(): string | null {
  const raw = process.env.TELEGRAM_MINIAPP_URL?.trim();
  if (!raw) return null;

  let parsed: URL | null = null;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = null;
  }
  if (parsed?.protocol === "https:") return raw.replace(/\/+$/, "");

  // Жалуемся один раз за процесс: botLinks зовётся на каждое сообщение, а
  // причина у всех одна и та же — заваливать ею диагностику незачем.
  if (miniAppComplaint !== raw) {
    miniAppComplaint = raw;
    reportBotProblem(
      `TELEGRAM_MINIAPP_URL — не https-адрес: «${raw}». Кнопка Mini App выключена, `
        + "сообщения уходят с обычной ссылкой. Похоже, в значение попало имя переменной.",
    );
  }
  return null;
}

export function botLinks(): BotLinks {
  return {
    inboxUrl: absoluteUrl("/app/inbox"),
    miniAppUrl: miniAppUrl(),
    planUrl: absoluteUrl("/raschet/plan"),
    premiumUrl: absoluteUrl("/app/settings"),
    dishUrl: (slug: string) => absoluteUrl(`/skolko-kalorij/${slug}`),
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

/**
 * Кнопка расчёта для того, у кого ещё нет аккаунта.
 *
 * Ведёт на обычную страницу, а не в Mini App: Mini App начинается с экрана
 * привязки, и незнакомому человеку он покажет форму ввода кода вместо
 * ответа на вопрос, ради которого тот пришёл. Расчёт же работает без
 * аккаунта вовсе — он целиком считается в браузере.
 */
export function planButton(links: BotLinks): InlineKeyboardButton {
  return { text: "Посчитать норму", url: links.planUrl };
}

/**
 * Кнопка тарифа. Появляется, только когда приём денег включён (docs/payments.md).
 *
 * Ведёт на экран тарифа, а не сразу в оплату. Ссылки Tribute несут подписанную
 * метку человека (lib/payments/tribute.ts), и подпись ставится на сервере, где
 * живёт секрет; собрать такую ссылку в сообщении бота значило бы либо вынести
 * секрет сюда, либо отправить человека платить без метки — а тогда платёж не
 * найдёт, кому его засчитать.
 */
export function premiumButton(links: BotLinks): InlineKeyboardButton {
  return links.miniAppUrl
    ? { text: "Открыть тариф", web_app: { url: links.miniAppUrl } }
    : { text: "Открыть тариф", url: links.premiumUrl };
}
