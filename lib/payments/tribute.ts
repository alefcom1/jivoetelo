/**
 * Приём оплаты через Tribute (tribute.tg).
 *
 * ## Почему Tribute, а не Unitpay, хотя код Unitpay уже написан
 *
 * Решение владельца сервиса, принятое с открытыми глазами: интеграция Unitpay
 * (`lib/payments/unitpay.ts`) остаётся в репозитории и не удаляется — она
 * рабочая, покрыта тестами и пригодится, если Tribute однажды перестанет
 * устраивать. Два обработчика мирно живут рядом: у каждого свой маршрут, своя
 * запись в `payments.provider` и свой ключ в окружении.
 *
 * ## Главная особенность этого модуля: спецификация подтверждена не полностью
 *
 * Документация Tribute (`wiki.tribute.tg`) закрыта от нашей среды — отдаёт 403
 * и на страницу вебхуков, и на страницу веб-оплаты. Поэтому имена полей в
 * уведомлении и заголовок с подписью здесь **восстановлены по вторичным
 * источникам, а не прочитаны в первоисточнике**, и почти наверняка отличаются
 * в мелочах.
 *
 * Из этого следует всё устройство модуля:
 *
 * 1. **Разбор терпимый.** Каждое поле ищется под несколькими правдоподобными
 *    именами (`telegram_user_id`, `telegramUserId`, `user.telegram_id`, …).
 *    Ошибиться в одном имени — значит потерять платёж, а стоимость лишней
 *    строки в списке кандидатов нулевая.
 * 2. **Ничего не выдаётся по непроверенному уведомлению.** Не сошлась подпись
 *    — событие записывается в `payment_events` как непроверенное, доступ не
 *    открывается, деньги видны администратору. Обратный порядок («выдадим, а
 *    там разберёмся») превращает открытый маршрут в бесплатную раздачу.
 * 3. **Сырое тело сохраняется целиком.** Первое же настоящее уведомление
 *    покажет действительные имена полей, и правка сведётся к одному списку
 *    кандидатов — без гадания и без потери платежей, пришедших до неё.
 *
 * Когда первый платёж пройдёт и настоящая форма станет известна, лишние
 * кандидаты можно убрать — но спешить с этим незачем.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { TARIFFS, tariffByKey, type TariffKey } from "../paid.ts";

export type TributeConfig = {
  enabled: boolean;
  /** Ключ из кабинета Tribute: Settings → API Keys. Им подписаны уведомления. */
  apiKey: string;
  /** Ссылка веб-оплаты на каждый тариф — свой цифровой товар в кабинете. */
  links: Record<TariffKey, string>;
  /** Секрет для подписи ссылки на человека. Отдельный от apiKey. */
  refSecret: string;
};

/**
 * Настройки из окружения.
 *
 * `PAYMENTS_ENABLED` отделён от ключей сознательно и это правило пережило
 * смену провайдера: наличие ключей само по себе ничего не включает. Иначе
 * скопированный на тестовый стенд `.env` начал бы принимать настоящие деньги.
 */
export function getTributeConfig(): TributeConfig | null {
  const apiKey = process.env.TRIBUTE_API_KEY?.trim();
  const month = process.env.TRIBUTE_LINK_MONTH?.trim();
  const year = process.env.TRIBUTE_LINK_YEAR?.trim();
  if (!apiKey || !month || !year) return null;
  return {
    enabled: process.env.PAYMENTS_ENABLED === "true",
    apiKey,
    links: { month, year },
    // Умолчание — сам apiKey: отдельный секрет полезен, но требовать его
    // заведения ради ссылки значило бы дать ещё один способ не запуститься.
    refSecret: process.env.TRIBUTE_REF_SECRET?.trim() || apiKey,
  };
}

export function tributeEnabled(): boolean {
  return getTributeConfig()?.enabled === true;
}

/**
 * Метка человека в ссылке оплаты.
 *
 * Подписанная, а не просто номер: ссылка видна человеку в адресной строке, и
 * без подписи достаточно поменять в ней цифру, чтобы оплатить доступ соседу —
 * или, что хуже, чтобы чужая оплата зачлась не тому.
 *
 * Без состояния в базе: отдельная колонка с токеном означала бы миграцию,
 * очистку протухших и ещё одно место, где можно рассинхронизироваться.
 */
export function makeRef(userId: number, secret: string): string {
  const mac = createHmac("sha256", secret).update(`u:${userId}`).digest("hex").slice(0, 12);
  return `${userId}.${mac}`;
}

/** Обратная операция. `null` — подделка или мусор, а не «пользователь 0». */
export function parseRef(ref: string | null | undefined, secret: string): number | null {
  if (!ref) return null;
  const [rawId, mac] = String(ref).split(".");
  const userId = Number(rawId);
  if (!Number.isInteger(userId) || userId <= 0 || !mac) return null;
  return makeRef(userId, secret).split(".")[1] === mac ? userId : null;
}

/**
 * Ссылка оплаты для конкретного человека.
 *
 * Метка идёт отдельным параметром запроса. Дойдёт ли она до уведомления —
 * зависит от Tribute, и полагаться только на неё нельзя: `matchPayer` пробует
 * ещё два пути (Telegram и почта).
 */
export function paymentLink(config: TributeConfig, tariff: TariffKey, userId: number): string {
  const base = config.links[tariff];
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}ref=${encodeURIComponent(makeRef(userId, config.refSecret))}`;
}

/**
 * Проверка подписи уведомления.
 *
 * HMAC-SHA256 сырого тела ключом из кабинета, hex. Сравнение за постоянное
 * время: побайтовое сравнение подписи позволяет подобрать её по времени
 * ответа, и это не теория — на платёжных обработчиках так и делают.
 *
 * Заголовок ищется под несколькими именами по той же причине, что и поля:
 * настоящее имя не подтверждено. Пустой заголовок — не «подпись верна».
 */
export const SIGNATURE_HEADERS = [
  "trbt-signature",
  "tribute-signature",
  "x-tribute-signature",
  "x-signature",
];

export function readSignature(headers: Headers): string | null {
  for (const name of SIGNATURE_HEADERS) {
    const value = headers.get(name);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

export function verifySignature(rawBody: string, signature: string | null, apiKey: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", apiKey).update(rawBody, "utf8").digest("hex");
  // Некоторые сервисы шлют подпись с префиксом вида `sha256=`.
  const got = signature.includes("=") ? signature.slice(signature.indexOf("=") + 1) : signature;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(got.toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Достаёт значение по любому из путей: `a.b.c` разбирается по точкам. */
function pick(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    let node: unknown = source;
    for (const key of path.split(".")) {
      if (node === null || typeof node !== "object") { node = undefined; break; }
      node = (node as Record<string, unknown>)[key];
    }
    if (node !== undefined && node !== null && node !== "") return node;
  }
  return undefined;
}

const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : null;

export type TributeEvent = {
  /** Тип события как прислал Tribute, в нижнем регистре. */
  type: string;
  /** Идентификатор покупки у Tribute — ключ идемпотентности. */
  externalId: string | null;
  /** Сумма в минимальных единицах (копейках), если её удалось понять. */
  amountMinor: number | null;
  currency: string | null;
  telegramUserId: string | null;
  email: string | null;
  /** Наша метка из ссылки оплаты, если Tribute её вернул. */
  ref: string | null;
  /** Название товара — запасной способ понять тариф. */
  productName: string | null;
};

/**
 * Разбор уведомления. Ни одно поле не обязательно: неизвестное остаётся
 * `null`, и решение о том, хватает ли данных, принимает вызывающий код.
 */
export function parseEvent(body: unknown): TributeEvent {
  const payload = (pick(body, ["payload", "data", "object"]) ?? body) as unknown;
  const both = [body, payload];
  const from = (paths: string[]) => {
    for (const source of both) {
      const found = pick(source, paths);
      if (found !== undefined) return found;
    }
    return undefined;
  };

  return {
    type: String(asString(from(["name", "event", "event_type", "eventType", "type"])) ?? "").toLowerCase(),
    externalId: asString(from([
      "purchase_id", "purchaseId", "payment_id", "paymentId", "id", "order_id", "orderId",
    ])),
    amountMinor: (() => {
      const raw = from(["amount", "price", "sum", "total", "amount_minor"]);
      const value = typeof raw === "number" ? raw : Number(asString(raw));
      return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
    })(),
    currency: asString(from(["currency", "currency_code", "currencyCode"]))?.toUpperCase() ?? null,
    telegramUserId: asString(from([
      "telegram_user_id", "telegramUserId", "user_id", "userId",
      "user.telegram_id", "user.telegram_user_id", "subscriber.telegram_id",
    ])),
    email: asString(from(["email", "user.email", "buyer.email", "customer_email"]))?.toLowerCase() ?? null,
    ref: asString(from([
      "ref", "payload", "custom", "custom_data", "customData", "external_ref", "metadata.ref",
    ])),
    productName: asString(from([
      "product_name", "productName", "name", "title", "product.name", "digital_product.name",
    ])),
  };
}

export function isRefundEvent(event: TributeEvent): boolean {
  return event.type.includes("refund") || event.type.includes("cancel");
}

/**
 * Событие ли это об успешной покупке.
 *
 * Список положительный и **сверяется точно**, а не вхождением подстроки.
 * Разница не косметическая: `subscription_reminder` содержит `subscription`,
 * и при проверке вхождением напоминание о скором продлении открывало бы
 * платный доступ бесплатно. Это поймал тест — и ровно ради такого он и писан.
 *
 * Точное совпадение против неполной документации выбрано сознательно. Ошибка
 * в строгую сторону: настоящее событие с незнакомым именем попадёт в админку
 * как «не про оплату», вместе с сырым телом, — и чинится одной строкой в этом
 * списке. Ошибка в обратную сторону — раздача премиума по напоминанию.
 */
const PAID_EVENTS = new Set([
  "new_digital_product",
  "digital_product",
  "digital_product_purchase",
  "new_subscription",
  "subscription_created",
  "new_purchase",
  "purchase",
  "payment",
  "payment_succeeded",
  "order_paid",
  "paid",
]);

export function isPaidEvent(event: TributeEvent): boolean {
  if (!event.type) return false;
  if (isRefundEvent(event)) return false;
  return PAID_EVENTS.has(event.type);
}

/**
 * Какой тариф оплачен.
 *
 * Сначала по сумме — это единственный признак, который Tribute обязан
 * передать в любом виде уведомления. Сумма приходит в минимальных единицах,
 * но некоторые сервисы шлют рубли: принимаем оба прочтения, если одно из них
 * точно совпадает с ценой тарифа.
 *
 * Запасной путь — название товара: в кабинете оно наше, и «Год» в нём есть.
 * Если не сошлось ничего, возвращаем `null`: выдать наугад месяц вместо года
 * (или наоборот) хуже, чем показать администратору платёж без тарифа.
 */
export function tariffFromEvent(event: TributeEvent): TariffKey | null {
  if (event.amountMinor !== null) {
    for (const tariff of TARIFFS) {
      if (event.amountMinor === tariff.priceRub * 100 || event.amountMinor === tariff.priceRub) {
        return tariff.key;
      }
    }
  }
  const name = (event.productName ?? "").toLowerCase();
  if (name) {
    for (const tariff of TARIFFS) {
      if (name.includes(tariff.label.toLowerCase())) return tariff.key;
    }
  }
  return null;
}

export function daysForTariff(key: TariffKey | null): number | null {
  return key ? (tariffByKey(key)?.days ?? null) : null;
}
