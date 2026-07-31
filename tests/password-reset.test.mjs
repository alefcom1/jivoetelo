import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkNewPassword,
  checkResetToken,
  createResetToken,
  hashResetToken,
  MIN_PASSWORD_LENGTH,
  resetEmail,
  RESET_TTL_MS,
} from "../lib/password-reset.ts";

/**
 * Ссылка смены пароля — это ключ от аккаунта, отправленный по почте. Ошибка
 * здесь означает не «неудобно», а «чужой человек вошёл под вами», поэтому
 * проверки написаны от противного: перечислить всё, из-за чего ссылка обязана
 * перестать работать, и убедиться в каждом.
 */

const NOW = new Date("2026-08-11T12:00:00Z");

function bytes(fill) {
  return (size) => new Uint8Array(size).fill(fill);
}

test("токен живёт час и приходит вместе со своим хешем", () => {
  const { token, tokenHash, expiresAt } = createResetToken(NOW, bytes(7));
  assert.equal(expiresAt.getTime() - NOW.getTime(), RESET_TTL_MS);
  assert.equal(tokenHash, hashResetToken(token));
});

test("в базу уходит хеш, а не сам токен", () => {
  // Как у сессий: утечка базы не должна давать готовых ключей.
  const { token, tokenHash } = createResetToken(NOW, bytes(1));
  assert.notEqual(token, tokenHash);
  assert.match(tokenHash, /^[0-9a-f]{64}$/);
  assert.ok(!tokenHash.includes(token));
});

test("токен без посторонних знаков — он поедет в адресной строке", () => {
  const { token } = createResetToken(NOW, bytes(255));
  assert.match(token, /^[A-Za-z0-9_-]+$/, "base64url не должен требовать экранирования");
});

function row(overrides = {}) {
  return { userId: 42, expiresAt: new Date(NOW.getTime() + 60_000), usedAt: null, ...overrides };
}

test("годная ссылка открывает смену пароля", () => {
  assert.deepEqual(checkResetToken(row(), NOW), { valid: true, userId: 42 });
});

test("несуществующая, истёкшая и использованная ссылка не работают", () => {
  assert.deepEqual(checkResetToken(null, NOW), { valid: false, reason: "not_found" });
  assert.deepEqual(
    checkResetToken(row({ expiresAt: new Date(NOW.getTime() - 1) }), NOW),
    { valid: false, reason: "expired" },
  );
  assert.deepEqual(checkResetToken(row({ usedAt: NOW }), NOW), { valid: false, reason: "used" });
});

test("ссылка гаснет ровно в свою секунду", () => {
  assert.deepEqual(checkResetToken(row({ expiresAt: NOW }), NOW), { valid: false, reason: "expired" });
});

test("использованная ссылка не оживает оттого, что час ещё не вышел", () => {
  // Порядок проверок важен: одноразовость сильнее срока.
  const used = row({ usedAt: new Date(NOW.getTime() - 1000), expiresAt: new Date(NOW.getTime() + 60_000) });
  assert.deepEqual(checkResetToken(used, NOW), { valid: false, reason: "used" });
});

test("короткий и несовпадающий пароль отвергаются", () => {
  assert.equal(checkNewPassword("x".repeat(MIN_PASSWORD_LENGTH), "x".repeat(MIN_PASSWORD_LENGTH)), null);
  assert.equal(checkNewPassword("x".repeat(MIN_PASSWORD_LENGTH - 1), "x".repeat(MIN_PASSWORD_LENGTH - 1)), "too_short");
  assert.equal(checkNewPassword("правильный-пароль", "правильный-паролъ"), "mismatch");
});

test("длинный пароль не отвергается", () => {
  // Верхняя граница мешала бы менеджерам паролей и никого не защищает.
  const long = "s".repeat(200);
  assert.equal(checkNewPassword(long, long), null);
});

test("письмо содержит ссылку и в тексте, и кликабельной", () => {
  const link = "https://jivoetelo.ru/reset?token=abc-DEF_123";
  const letter = resetEmail(link);
  assert.ok(letter.text.includes(link), "в простом тексте ссылка обязана быть целиком");
  assert.ok(letter.html.includes(`href="${link}"`), "в HTML — атрибутом, иначе её не нажать");
  assert.ok(letter.subject.length > 0);
});

test("письмо не обвиняет и объясняет, что делать, если это были не вы", () => {
  // Такое письмо часто приходит человеку, который его не запрашивал. Оно не
  // должно ни пугать, ни требовать действий: правильное действие — никакое.
  const letter = resetEmail("https://jivoetelo.ru/reset?token=x");
  assert.match(letter.text, /не вы/i);
  assert.match(letter.text, /ничего делать не нужно/i);
  assert.doesNotMatch(letter.text, /срочно|немедленно|взлом|подозрительн/i);
});

test("в письме нет ничего, кроме ссылки, что указывало бы на аккаунт", () => {
  // Письмо может прийти не тому: адрес мог быть введён с опечаткой. Ни имени,
  // ни данных дневника в нём быть не должно.
  const letter = resetEmail("https://jivoetelo.ru/reset?token=x");
  assert.doesNotMatch(letter.text, /ккал|вес|дневник за|ваш план/i);
});
