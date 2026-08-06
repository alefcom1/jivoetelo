import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  daysForTariff,
  isPaidEvent,
  isRefundEvent,
  makeRef,
  parseEvent,
  parseRef,
  paymentLink,
  readSignature,
  tariffFromEvent,
  verifySignature,
} from "../lib/payments/tribute.ts";

/**
 * Приём оплаты через Tribute — чистая часть: подпись, метка человека, разбор
 * уведомления. Работа с базой (`lib/payments/store.ts`) сюда не входит.
 *
 * Тесты здесь важнее обычного по одной причине: документация Tribute из нашей
 * среды не открывается (403), имена полей восстановлены по вторичным
 * источникам, и проверить разбор на настоящем уведомлении мы пока не можем.
 * Значит проверяем то, что от их формата не зависит: что подделанная подпись
 * не проходит, что чужая метка не засчитывается, что незнакомое событие не
 * открывает доступ, и что разбор не разваливается на теле неожиданной формы.
 */

const KEY = "test-api-key";
const SECRET = "test-ref-secret";

const sign = (body) => createHmac("sha256", KEY).update(body, "utf8").digest("hex");

test("подпись сходится только для того же тела и того же ключа", () => {
  const body = JSON.stringify({ name: "new_digital_product", purchase_id: "p1" });
  assert.equal(verifySignature(body, sign(body), KEY), true);
  assert.equal(verifySignature(`${body} `, sign(body), KEY), false, "тело подменили");
  assert.equal(
    verifySignature(body, createHmac("sha256", "чужой").update(body).digest("hex"), KEY),
    false,
    "ключ чужой",
  );
});

test("пустая подпись — это не «подпись верна»", () => {
  // Самая дорогая ошибка в платёжном обработчике: отсутствие заголовка
  // трактуется как «проверять нечего», и маршрут раздаёт доступ всякому.
  const body = "{}";
  assert.equal(verifySignature(body, null, KEY), false);
  assert.equal(verifySignature(body, "", KEY), false);
  assert.equal(verifySignature(body, "   ", KEY), false);
});

test("подпись с префиксом алгоритма тоже принимается", () => {
  const body = JSON.stringify({ a: 1 });
  assert.equal(verifySignature(body, `sha256=${sign(body)}`, KEY), true);
  assert.equal(verifySignature(body, `sha256=${sign(body).toUpperCase()}`, KEY), true);
});

test("заголовок с подписью ищется под несколькими именами", () => {
  // Настоящее имя не подтверждено первоисточником. Список кандидатов — не
  // неряшливость, а плата за недоступную документацию.
  for (const name of ["trbt-signature", "tribute-signature", "x-tribute-signature", "x-signature"]) {
    assert.equal(readSignature(new Headers({ [name]: "abc" })), "abc", name);
  }
  assert.equal(readSignature(new Headers({ "content-type": "application/json" })), null);
});

test("метка человека не подделывается сменой номера", () => {
  const ref = makeRef(42, SECRET);
  assert.equal(parseRef(ref, SECRET), 42);
  // Ровно то, ради чего метка подписана: иначе достаточно поправить цифру в
  // адресной строке, чтобы оплата зачлась соседу.
  assert.equal(parseRef(ref.replace("42.", "43."), SECRET), null);
  assert.equal(parseRef(ref, "другой секрет"), null);
  assert.equal(parseRef("42", SECRET), null, "метка без подписи");
  assert.equal(parseRef(null, SECRET), null);
  assert.equal(parseRef("0.abc", SECRET), null, "нулевой номер — не пользователь");
});

test("ссылка оплаты несёт метку и не ломает уже имеющийся запрос", () => {
  const config = { enabled: true, apiKey: KEY, refSecret: SECRET, links: {
    month: "https://t.me/tribute/app?startapp=abc",
    year: "https://web.tribute.tg/p/xyz",
  } };
  const withQuery = paymentLink(config, "month", 7);
  assert.ok(withQuery.includes("startapp=abc"), "потерян исходный параметр");
  assert.ok(withQuery.includes("&ref="), "метка должна добавляться через &");
  assert.ok(paymentLink(config, "year", 7).includes("?ref="), "метка должна добавляться через ?");
  assert.equal(parseRef(new URL(paymentLink(config, "year", 7)).searchParams.get("ref"), SECRET), 7);
});

test("оплата опознаётся, а незнакомое событие — нет", () => {
  const paid = (name) => isPaidEvent(parseEvent({ name, purchase_id: "1" }));
  assert.equal(paid("new_digital_product"), true);
  assert.equal(paid("new_subscription"), true);
  // Незнакомое событие не должно открывать доступ только потому, что оно не
  // похоже на отказ: напоминание о продлении — тоже не отказ.
  assert.equal(paid("subscription_reminder"), false);
  assert.equal(paid(""), false);
  assert.equal(paid("digital_product_refund"), false, "возврат не оплата");
});

test("возврат опознаётся отдельно", () => {
  assert.equal(isRefundEvent(parseEvent({ name: "digital_product_refund" })), true);
  assert.equal(isRefundEvent(parseEvent({ name: "cancelled_subscription" })), true);
  assert.equal(isRefundEvent(parseEvent({ name: "new_subscription" })), false);
});

test("поля читаются и из корня, и из вложенного payload", () => {
  const flat = parseEvent({
    name: "new_digital_product", purchase_id: "abc", amount: 19000, currency: "rub",
    telegram_user_id: 555, email: "Ivan@Example.COM", ref: "1.deadbeef",
  });
  assert.equal(flat.externalId, "abc");
  assert.equal(flat.amountMinor, 19000);
  assert.equal(flat.currency, "RUB");
  assert.equal(flat.telegramUserId, "555", "число приводится к строке: в базе id текстовый");
  assert.equal(flat.email, "ivan@example.com", "почта сравнивается в нижнем регистре");

  const nested = parseEvent({
    name: "new_digital_product",
    payload: { purchase_id: "xyz", amount: 190000, user: { telegram_id: 777, email: "a@b.c" } },
  });
  assert.equal(nested.externalId, "xyz");
  assert.equal(nested.telegramUserId, "777");
  assert.equal(nested.email, "a@b.c");
});

test("разбор не падает на теле неожиданной формы", () => {
  // Формат не подтверждён первоисточником, поэтому «непонятное тело» — это
  // рабочий случай, а не аварийный. Исключение здесь означало бы 500 в ответ
  // Tribute и поток повторов.
  for (const body of [null, "строка", 42, [], {}, { payload: null }, { user: "не объект" }]) {
    const event = parseEvent(body);
    assert.equal(typeof event.type, "string");
    assert.equal(isPaidEvent(event), false, "из мусора не должно получаться оплаты");
  }
});

test("тариф определяется по сумме — и в копейках, и в рублях", () => {
  assert.equal(tariffFromEvent(parseEvent({ amount: 19000 })), "month");
  assert.equal(tariffFromEvent(parseEvent({ amount: 190 })), "month");
  assert.equal(tariffFromEvent(parseEvent({ amount: 190000 })), "year");
  assert.equal(tariffFromEvent(parseEvent({ amount: 1900 })), "year");
  assert.equal(daysForTariff("month"), 30);
  assert.equal(daysForTariff("year"), 365);
  assert.equal(daysForTariff(null), null);
});

test("сумма не из прейскуранта не превращается в тариф наугад", () => {
  // Выдать месяц вместо года (или наоборот) хуже, чем показать платёж без
  // тарифа: во втором случае администратор разберётся, в первом — никто.
  assert.equal(tariffFromEvent(parseEvent({ amount: 50000 })), null);
  assert.equal(tariffFromEvent(parseEvent({})), null);
});

test("запасной путь — название товара", () => {
  assert.equal(tariffFromEvent(parseEvent({ product_name: "Живое Тело — Год" })), "year");
  assert.equal(tariffFromEvent(parseEvent({ product_name: "Доступ на месяц" })), "month");
});

test("цены в ссылках и в разборе берутся из одного места", async () => {
  // Тариф в кабинете Tribute заводится руками, и совпадение цены с кодом —
  // единственное, по чему обработчик понимает, что оплатили. Если цены здесь
  // разъедутся с lib/paid.ts, все платежи станут «тариф не опознан».
  const { TARIFFS } = await import("../lib/paid.ts");
  for (const tariff of TARIFFS) {
    assert.equal(tariffFromEvent(parseEvent({ amount: tariff.priceRub * 100 })), tariff.key);
  }
});
