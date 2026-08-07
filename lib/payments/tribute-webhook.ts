/**
 * Что делать с пришедшим уведомлением Tribute — решение, отделённое от базы.
 *
 * ## Зачем отдельный модуль
 *
 * Спецификация Tribute восстановлена по вторичным источникам, а не прочитана:
 * `wiki.tribute.tg` отдаёт нашей среде 403 (см. lib/payments/tribute.ts). То
 * есть самый вероятный отказ здесь — не ошибка в коде, а несовпадение с
 * настоящим форматом, и разбирать его придётся по тому, что маршрут ответил и
 * что записал. Такой разбор нужен проверяемым целиком, а маршрут вместе с
 * базой не проверишь: `applyPayment` пишет в Postgres, которого в тестах нет.
 *
 * Поэтому здесь чистая функция: тело, заголовки и настройки на входе — на
 * выходе код ответа и запись в журнал. Всё, кроме одной ветки «выдать
 * доступ», решается здесь и покрыто тестами. Тот же приём, что у бота:
 * lib/bot/handle-update.ts решает, lib/bot/store.ts ходит в базу.
 */

import {
  isPaidEvent,
  isRefundEvent,
  parseEvent,
  readSignature,
  verifySignature,
  type TributeConfig,
  type TributeEvent,
} from "./tribute.ts";

/** Тело крупнее этого — не уведомление, а попытка забить нам базу. */
export const MAX_BODY_BYTES = 64 * 1024;

export type WebhookDecision =
  /** Ответить и записать, ничего не считая. */
  | {
      kind: "record";
      status: number;
      body: Record<string, unknown>;
      /** null — не записывать вовсе (только для превышения размера). */
      record: {
        verified: boolean;
        eventType: string | null;
        externalId: string | null;
        raw: unknown;
        outcome: string;
        note: string | null;
      } | null;
    }
  /** Единственная ветка, где дело доходит до базы и до выдачи доступа. */
  | { kind: "apply"; event: TributeEvent };

/**
 * Заголовки в журнал: только полезные. Токены туда попасть не должны — журнал
 * читают глазами в админке, и однажды его вывод кому-нибудь перешлют.
 */
export function safeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of headers.entries()) {
    if (name === "authorization" || name === "cookie") continue;
    out[name] = value.length > 300 ? `${value.slice(0, 300)}…` : value;
  }
  return out;
}

export function decideWebhook(
  rawBody: string,
  headers: Headers,
  config: TributeConfig | null,
): WebhookDecision {
  if (rawBody.length > MAX_BODY_BYTES) {
    return { kind: "record", status: 413, body: { ok: false, error: "too_large" }, record: null };
  }

  /**
   * Приём оплаты не настроен — и это тоже надо записать.
   *
   * Раньше здесь стоял только `console.error`, и «Отправить тестовый запрос»
   * из кабинета Tribute не оставлял в админке ни строчки. Владелец видел
   * «Не удалось отправить тестовый запрос» и не мог отличить «переменные не
   * записаны» от «подпись не сошлась» или «до сервера не достучались» — три
   * совершенно разных починки под одним и тем же сообщением.
   */
  if (!config) {
    return {
      kind: "record",
      status: 503,
      body: { ok: false, error: "not_configured" },
      record: {
        verified: false,
        eventType: null,
        externalId: null,
        raw: safeRaw(rawBody),
        outcome: "not_configured",
        note:
          "приём оплаты не настроен: в .env на сервере нет TRIBUTE_API_KEY, "
          + "TRIBUTE_LINK_MONTH или TRIBUTE_LINK_YEAR (docs/payments.md)",
      },
    };
  }

  const verified = verifySignature(rawBody, readSignature(headers), config.apiKey);

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    // Неразбираемое тело тоже говорит о том, что мы чего-то не знаем о
    // формате, — сохраняем строкой.
    return {
      kind: "record",
      status: 200,
      body: { ok: true },
      record: {
        verified,
        eventType: null,
        externalId: null,
        raw: safeRaw(rawBody),
        outcome: "ignored",
        note: "тело не разобралось как JSON",
      },
    };
  }

  const event = parseEvent(body);

  if (!verified) {
    return {
      kind: "record",
      status: 401,
      body: { ok: false, error: "bad_signature" },
      record: {
        verified: false,
        eventType: event.type || null,
        externalId: event.externalId,
        raw: body,
        outcome: "bad_signature",
        note:
          "подпись не сошлась — доступ не выдан. Проверьте TRIBUTE_API_KEY и имя "
          + "заголовка с подписью в этом же событии",
      },
    };
  }

  if (!config.enabled) {
    // Ключи есть, PAYMENTS_ENABLED не выставлен. Событие сохраняем: это ровно
    // та проверка связи, ради которой такое состояние и существует.
    return {
      kind: "record",
      status: 200,
      body: { ok: true, note: "payments disabled" },
      record: {
        verified: true,
        eventType: event.type || null,
        externalId: event.externalId,
        raw: body,
        outcome: "disabled",
        note: "приём оплаты выключен (PAYMENTS_ENABLED)",
      },
    };
  }

  if (isRefundEvent(event)) {
    // Возврат не отзывает доступ автоматически: отобрать оплаченное у
    // человека, который мог вернуть деньги по ошибке, — решение с
    // последствиями, и принимать его должен человек в админке.
    return {
      kind: "record",
      status: 200,
      body: { ok: true },
      record: {
        verified: true,
        eventType: event.type,
        externalId: event.externalId,
        raw: body,
        outcome: "ignored",
        note: "возврат — доступ снимается вручную в админке",
      },
    };
  }

  if (!isPaidEvent(event) || !event.externalId) {
    return {
      kind: "record",
      status: 200,
      body: { ok: true },
      record: {
        verified: true,
        eventType: event.type || null,
        externalId: event.externalId,
        raw: body,
        outcome: "ignored",
        note: event.externalId ? "событие не об оплате" : "в событии нет идентификатора покупки",
      },
    };
  }

  return { kind: "apply", event };
}

/** Сырое тело в журнал — с потолком: в базу оно ложится целиком. */
function safeRaw(rawBody: string): { unparsed: string } {
  return { unparsed: rawBody.slice(0, 4000) };
}
