import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { decideWebhook, MAX_BODY_BYTES, safeHeaders } from "../lib/payments/tribute-webhook.ts";

/**
 * Решение по уведомлению Tribute.
 *
 * Спецификация восстановлена по вторичным источникам — их вики отдаёт нашей
 * среде 403, — и самый вероятный отказ здесь не ошибка в коде, а несовпадение
 * с настоящим форматом. Разбирать его придётся по двум вещам: что маршрут
 * ответил и что он записал. Значит проверять надо ровно это, а не «не упало».
 */

const KEY = "70e2f956-c19c-4f6a-b6d8-d7f9e0d3";
const CONFIG = {
  enabled: true,
  apiKey: KEY,
  // Настоящие ссылки веб-оплаты из кабинета — не входы в Mini App: к ним
  // пришивается метка человека отдельным параметром запроса.
  links: { month: "https://web.tribute.tg/p/Bw2", year: "https://web.tribute.tg/p/Bw4" },
  refSecret: KEY,
};

function signed(body, key = KEY) {
  const raw = JSON.stringify(body);
  const mac = createHmac("sha256", key).update(raw, "utf8").digest("hex");
  return { raw, headers: new Headers({ "trbt-signature": mac }) };
}

const PAID = {
  name: "new_digital_product",
  payload: { purchase_id: "p-1", amount: 19000, currency: "RUB", telegram_user_id: 777 },
};

test("не настроенный приём оплаты отвечает 503 и оставляет след", () => {
  // Ровно этот случай владелец видит как «Не удалось отправить тестовый
  // запрос» в кабинете. Без записи в журнале «переменные не записаны»
  // неотличимо от «подпись не сошлась» и от «сервер недоступен» — три разные
  // починки под одним сообщением.
  const { raw, headers } = signed(PAID);
  const decision = decideWebhook(raw, headers, null);

  assert.equal(decision.kind, "record");
  assert.equal(decision.status, 503);
  assert.equal(decision.record?.outcome, "not_configured");
  assert.match(decision.record?.note ?? "", /TRIBUTE_API_KEY/);
  assert.match(decision.record?.note ?? "", /TRIBUTE_LINK_MONTH/);
});

test("подписанная оплата доходит до выдачи доступа", () => {
  const { raw, headers } = signed(PAID);
  const decision = decideWebhook(raw, headers, CONFIG);
  assert.equal(decision.kind, "apply");
  assert.equal(decision.event.externalId, "p-1");
  assert.equal(decision.event.amountMinor, 19000);
});

test("чужая подпись не выдаёт доступ и объясняет, что проверить", () => {
  const { raw } = signed(PAID, "не тот ключ");
  const mac = createHmac("sha256", "не тот ключ").update(raw, "utf8").digest("hex");
  const decision = decideWebhook(raw, new Headers({ "trbt-signature": mac }), CONFIG);

  assert.equal(decision.kind, "record");
  assert.equal(decision.status, 401);
  assert.equal(decision.record?.outcome, "bad_signature");
  // Тело сохраняем разобранным: по нему и станет видно настоящий формат.
  assert.equal(decision.record?.verified, false);
  assert.match(decision.record?.note ?? "", /заголовка/);
});

test("уведомление без подписи вовсе — тоже отказ, а не «подпись верна»", () => {
  const { raw } = signed(PAID);
  const decision = decideWebhook(raw, new Headers(), CONFIG);
  assert.equal(decision.status, 401);
});

test("подпись читается под всеми четырьмя именами заголовка", () => {
  const { raw } = signed(PAID);
  const mac = createHmac("sha256", KEY).update(raw, "utf8").digest("hex");
  for (const name of ["trbt-signature", "tribute-signature", "x-tribute-signature", "x-signature"]) {
    const decision = decideWebhook(raw, new Headers({ [name]: mac }), CONFIG);
    assert.equal(decision.kind, "apply", name);
  }
});

test("выключенный приём денег принимает и записывает, но не выдаёт", () => {
  // Это рабочий режим проверки связи, а не недонастройка: ключи заданы,
  // PAYMENTS_ENABLED нет. Уведомление обязано дойти до админки целиком.
  const { raw, headers } = signed(PAID);
  const decision = decideWebhook(raw, headers, { ...CONFIG, enabled: false });

  assert.equal(decision.kind, "record");
  assert.equal(decision.status, 200, "иначе Tribute сочтёт адрес нерабочим и начнёт слать повторы");
  assert.equal(decision.record?.outcome, "disabled");
  assert.equal(decision.record?.verified, true);
});

test("возврат записывается, но доступ сам не отзывает", () => {
  const { raw, headers } = signed({ name: "refund", payload: { purchase_id: "p-2", amount: 19000 } });
  const decision = decideWebhook(raw, headers, CONFIG);

  assert.equal(decision.kind, "record");
  assert.equal(decision.status, 200);
  assert.equal(decision.record?.outcome, "ignored");
  assert.match(decision.record?.note ?? "", /вручную/);
});

test("напоминание о продлении не открывает платный доступ", () => {
  // Событие содержит слово subscription, и проверка вхождением подстроки
  // раздавала бы по нему премиум бесплатно.
  const { raw, headers } = signed({
    name: "subscription_reminder",
    payload: { purchase_id: "p-3", amount: 19000 },
  });
  const decision = decideWebhook(raw, headers, CONFIG);
  assert.equal(decision.kind, "record");
  assert.equal(decision.record?.outcome, "ignored");
});

test("оплата без идентификатора покупки не применяется", () => {
  // Без него нет ключа идемпотентности: повтор уведомления продлил бы доступ
  // второй раз за те же деньги.
  const { raw, headers } = signed({ name: "new_digital_product", payload: { amount: 19000 } });
  const decision = decideWebhook(raw, headers, CONFIG);
  assert.equal(decision.kind, "record");
  assert.match(decision.record?.note ?? "", /идентификатора/);
});

test("неразбираемое тело сохраняется строкой, а не теряется", () => {
  const raw = "это не json";
  const mac = createHmac("sha256", KEY).update(raw, "utf8").digest("hex");
  const decision = decideWebhook(raw, new Headers({ "trbt-signature": mac }), CONFIG);

  assert.equal(decision.status, 200);
  assert.equal(decision.record?.outcome, "ignored");
  assert.equal(decision.record?.raw.unparsed, raw);
});

test("огромное тело отвергается до всякого разбора и в журнал не идёт", () => {
  const decision = decideWebhook("x".repeat(MAX_BODY_BYTES + 1), new Headers(), CONFIG);
  assert.equal(decision.status, 413);
  assert.equal(decision.record, null, "иначе забить базу можно одним циклом");
});

test("проверка подписи идёт по сырому телу, а не по пересобранному", () => {
  // JSON.stringify(JSON.parse(x)) переставляет пробелы и порядок ключей.
  // Проверять подпись по пересобранному телу — значит отвергать настоящие
  // уведомления, и понять это по логу почти невозможно.
  const raw = '{\n  "name": "new_digital_product",\n  "payload": { "purchase_id": "p-9", "amount": 19000 }\n}';
  const mac = createHmac("sha256", KEY).update(raw, "utf8").digest("hex");
  const decision = decideWebhook(raw, new Headers({ "trbt-signature": mac }), CONFIG);
  assert.equal(decision.kind, "apply");
});

test("секреты не попадают в журнал заголовков", () => {
  // Значения только ASCII: Headers требует ByteString и на кириллице падает.
  const headers = new Headers({
    authorization: "Bearer s3cr3t",
    cookie: "session=s3cr3t",
    "trbt-signature": "abc",
    "content-type": "application/json",
  });
  const logged = safeHeaders(headers);
  assert.equal(logged.authorization, undefined);
  assert.equal(logged.cookie, undefined);
  assert.equal(logged["trbt-signature"], "abc");
});

test("длинный заголовок обрезается, а не раздувает запись", () => {
  const logged = safeHeaders(new Headers({ "x-long": "a".repeat(500) }));
  assert.ok(logged["x-long"].length <= 301);
  assert.ok(logged["x-long"].endsWith("…"));
});
