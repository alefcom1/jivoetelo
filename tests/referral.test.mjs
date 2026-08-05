import test from "node:test";
import assert from "node:assert/strict";
import {
  CODE_LENGTH,
  isReferralCode,
  makeReferralCode,
  referralFromStart,
  referralLink,
  REFERRAL_PREFIX,
} from "../lib/referral.ts";
import { START_PAYLOADS } from "../lib/bot-public.ts";

/**
 * Приглашения.
 *
 * Разбор `start`-параметра — единственное место, куда снаружи приходит
 * строка, выбранная не нами: её кладёт в ссылку Telegram, а до этого — кто
 * угодно. Он обязан уметь ровно одно: назвать код или не назвать ничего.
 */

test("код нужной длины и из безопасного алфавита", () => {
  const code = makeReferralCode();
  assert.equal(code.length, CODE_LENGTH);
  assert.ok(isReferralCode(code));
});

test("в алфавите нет символов, которые путают при чтении", () => {
  // Ноль и буква O, единица и l — единственная ошибка, которую здесь реально
  // совершают, когда код диктуют или переписывают с экрана.
  const codes = Array.from({ length: 200 }, () => makeReferralCode()).join("");
  for (const bad of ["0", "O", "o", "1", "l", "I", "i"]) {
    assert.ok(!codes.includes(bad), `в кодах встретился «${bad}»`);
  }
});

test("коды разные", () => {
  const codes = new Set(Array.from({ length: 500 }, () => makeReferralCode()));
  assert.ok(codes.size > 490, `повторов слишком много: уникальных ${codes.size} из 500`);
});

test("генератор детерминирован при заданном источнике случайности", () => {
  // Нужно тестам и живым проверкам: без этого нельзя воспроизвести ссылку.
  const fixed = () => 0;
  assert.equal(makeReferralCode(fixed), "2".repeat(CODE_LENGTH));
});

test("ссылка ведёт на бота и несёт код", () => {
  const link = referralLink("abcdefgh");
  assert.match(link, /^https:\/\/t\.me\//);
  assert.ok(link.includes(`${REFERRAL_PREFIX}abcdefgh`), link);
});

/* ===== Разбор того, что пришло снаружи ===== */

test("свой код узнаётся, чужое — нет", () => {
  assert.equal(referralFromStart("ref_abcdefgh"), "abcdefgh");
  assert.equal(referralFromStart("abcdefgh"), null, "без префикса это не приглашение");
  assert.equal(referralFromStart("ref_"), null);
  assert.equal(referralFromStart("ref_короткий"), null);
  assert.equal(referralFromStart("ref_ABCDEFGH"), null, "алфавит строчный");
  assert.equal(referralFromStart("ref_abcdefg0"), null, "ноля в алфавите нет");
  assert.equal(referralFromStart(null), null);
  assert.equal(referralFromStart(undefined), null);
  assert.equal(referralFromStart(""), null);
});

test("обычные метки диплинков не принимаются за приглашение", () => {
  // Иначе бот однажды принял бы метку за код и пошёл искать пригласившего.
  for (const payload of Object.values(START_PAYLOADS)) {
    assert.equal(referralFromStart(payload), null, payload);
  }
});

test("код приглашения не притворяется меткой", () => {
  // Обратная сторона того же: префикс отделяет произвольную строку от
  // закрытого списка из трёх слов.
  const code = makeReferralCode();
  assert.ok(!(Object.values(START_PAYLOADS)).includes(`${REFERRAL_PREFIX}${code}`));
});

test("проверка кода не пропускает мусор", () => {
  assert.ok(!isReferralCode(""));
  assert.ok(!isReferralCode(null));
  assert.ok(!isReferralCode(42));
  assert.ok(!isReferralCode("abc"));
  assert.ok(!isReferralCode("a".repeat(CODE_LENGTH + 1)));
  assert.ok(!isReferralCode("'; drop table users--"));
});
