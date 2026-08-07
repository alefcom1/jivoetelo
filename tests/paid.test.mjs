import test from "node:test";
import assert from "node:assert/strict";
import { daysLeft, effectivePlan, extendAccess, hasPaidAccess, TARIFFS, tariffByKey } from "../lib/paid.ts";
import { PLAN_LIMITS, AI_OPERATIONS } from "../lib/quota-policy.ts";
import {
  checkVoucher,
  CODE_LENGTH,
  formatCode,
  makeVoucherCode,
  normalizeCode,
} from "../lib/vouchers.ts";

/**
 * Платный доступ и ваучеры.
 *
 * Здесь проверяется главным образом то, что человек не теряет оплаченное:
 * ни при досрочном продлении, ни при погашении ваучера поверх действующего
 * доступа. Потерянный день — это не «мелкая неточность», а деньги, за
 * которые уже заплатили.
 */

const NOW = new Date("2026-08-05T12:00:00Z");
const at = (iso) => new Date(iso);

/* ===== Срок доступа ===== */

test("доступ открыт, пока срок не вышел", () => {
  assert.equal(hasPaidAccess(at("2026-08-06T00:00:00Z"), NOW), true);
  assert.equal(hasPaidAccess(at("2026-08-05T11:59:59Z"), NOW), false);
  assert.equal(hasPaidAccess(null, NOW), false);
});

test("тариф вычисляется из срока, а не хранится рядом с ним", () => {
  // Ради этого поле и одно: рассогласовать нечего. Флаг «premium: да»
  // пришлось бы снимать по расписанию, и упавший cron оставил бы доступ
  // тем, кто за него не платил.
  assert.equal(effectivePlan(at("2026-09-01T00:00:00Z"), NOW), "premium");
  assert.equal(effectivePlan(at("2026-07-01T00:00:00Z"), NOW), "free");
  assert.equal(effectivePlan(null, NOW), "free");
});

test("продление заранее не сжигает остаток", () => {
  // «Продлил за неделю до конца и потерял неделю» читается как обман, и
  // человек начинает тянуть до последнего дня.
  const until = at("2026-08-12T12:00:00Z"); // ещё 7 дней
  const extended = extendAccess(until, 30, NOW);
  assert.equal(daysLeft(extended, NOW), 37, "остаток не прибавился к новому сроку");
});

test("продление после окончания считается от сегодня, а не от старого срока", () => {
  const expired = at("2026-06-01T00:00:00Z");
  const extended = extendAccess(expired, 30, NOW);
  assert.equal(daysLeft(extended, NOW), 30, "просроченный доступ не должен съедать новый");
});

test("первое продление — от сегодня", () => {
  assert.equal(daysLeft(extendAccess(null, 30, NOW), NOW), 30);
});

test("остаток округляется вверх: доступ до вечера — это ещё день", () => {
  assert.equal(daysLeft(at("2026-08-05T23:00:00Z"), NOW), 1);
  assert.equal(daysLeft(at("2026-08-04T23:00:00Z"), NOW), 0, "истёкший доступ — ноль, а не отрицательное");
});

/* ===== Тарифы ===== */

test("тарифы заданы и находятся по ключу", () => {
  assert.equal(tariffByKey("month").priceRub, 190);
  assert.equal(tariffByKey("year").priceRub, 1900);
  assert.equal(tariffByKey("выдумка"), null);
});

test("год выгоднее двенадцати месяцев", () => {
  // Иначе годовой тариф — это просто способ заплатить больше вперёд.
  const month = tariffByKey("month");
  const year = tariffByKey("year");
  assert.ok(year.priceRub < month.priceRub * 12, `${year.priceRub} против ${month.priceRub * 12}`);
  assert.ok(year.days >= 365);
});

test("платный доступ ничего не отбирает у бесплатного", () => {
  // Главное обещание монетизации, и оно должно ломаться тестом, а не в
  // продакшене: премиум — это выше лимиты, а не меньше возможностей.
  for (const operation of AI_OPERATIONS) {
    assert.ok(
      PLAN_LIMITS.premium[operation] >= PLAN_LIMITS.free[operation],
      `${operation}: премиум уже бесплатного (${PLAN_LIMITS.premium[operation]} < ${PLAN_LIMITS.free[operation]})`,
    );
  }
  assert.ok(
    PLAN_LIMITS.premium.analyze_photo > PLAN_LIMITS.free.analyze_photo,
    "за деньги ничего не прибавляется — платить не за что",
  );
});

test("тарифов ровно столько, сколько объявлено человеку", () => {
  assert.equal(TARIFFS.length, 2);
  assert.deepEqual(TARIFFS.map((t) => t.key), ["month", "year"]);
});

/* ===== Коды ваучеров ===== */

test("код нужной длины и разбирается сам собой", () => {
  const code = makeVoucherCode();
  assert.equal(code.length, CODE_LENGTH);
  assert.equal(normalizeCode(code), code);
});

test("в кодах нет символов, которые путают при чтении", () => {
  const codes = Array.from({ length: 200 }, () => makeVoucherCode()).join("");
  for (const bad of ["0", "O", "1", "I", "L"]) {
    assert.ok(!codes.includes(bad), `в кодах встретился «${bad}»`);
  }
});

test("разбор прощает то, что человек делает не по злому умыслу", () => {
  const code = "ABCD2345";
  assert.equal(normalizeCode("abcd2345"), code, "строчные");
  assert.equal(normalizeCode("ABCD-2345"), code, "наш же дефис");
  assert.equal(normalizeCode("  ABCD 2345 "), code, "пробелы из буфера");
  assert.equal(normalizeCode("ABCD 2345"), code, "неразрывный пробел из вставки");
});

test("кириллические двойники латинских букв принимаются", () => {
  // «С», «Р», «А» с русской раскладки выглядят ровно как латинские, и
  // человек, набравший код не переключившись, ничего не заподозрит.
  assert.equal(normalizeCode("АВСЕ2345"), "ABCE2345");
  assert.equal(normalizeCode("КМНР2345"), "KMHP2345");
});

test("непохожее на код в базу не идёт", () => {
  assert.equal(normalizeCode(""), null);
  assert.equal(normalizeCode("ABC"), null, "короткий");
  assert.equal(normalizeCode("ABCD23456"), null, "длинный");
  assert.equal(normalizeCode("ABCD-2340"), null, "ноля в алфавите нет");
  assert.equal(normalizeCode("'; drop table users--"), null);
});

test("код показывается группами по четыре", () => {
  assert.equal(formatCode("ABCD2345"), "ABCD-2345");
});

/* ===== Погашение ===== */

test("свежий код гасится", () => {
  assert.deepEqual(checkVoucher({ usedBy: null, expiresAt: null }, NOW), { ok: true });
  assert.equal(checkVoucher({ usedBy: null, expiresAt: at("2026-09-01T00:00:00Z") }, NOW).ok, true);
});

test("использованный и просроченный различаются", () => {
  // Разные новости: «кодом поделились» и «код просто старый». Во втором
  // случае второй код попросить как раз можно.
  const used = checkVoucher({ usedBy: 7, expiresAt: null }, NOW);
  const expired = checkVoucher({ usedBy: null, expiresAt: at("2026-08-01T00:00:00Z") }, NOW);
  assert.equal(used.ok, false);
  assert.equal(expired.ok, false);
  assert.equal(used.reason, "used");
  assert.equal(expired.reason, "expired");
  assert.notEqual(used.message, expired.message);
});

test("тексты отказа не обвиняют", () => {
  const FORBIDDEN = [/недействительн/i, /запрещ/i, /нарушен/i, /попытк/i];
  const messages = [
    checkVoucher({ usedBy: 7, expiresAt: null }, NOW).message,
    checkVoucher({ usedBy: null, expiresAt: at("2026-08-01T00:00:00Z") }, NOW).message,
  ];
  for (const message of messages) {
    for (const bad of FORBIDDEN) assert.ok(!bad.test(message), `«${message}» нарушает ${bad}`);
    assert.ok(!message.includes("!"), `«${message}» — восклицание`);
  }
});
