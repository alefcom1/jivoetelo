import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validate } from "@telegram-apps/init-data-node";

// Проверяем сам механизм подписи Telegram (раздел 17 спеки: не доверять
// данным клиента без серверной проверки). Подпись строим так же, как её
// строит Telegram: HMAC-SHA256 с ключом, производным от токена бота.

const BOT_TOKEN = "123456:TEST-BOT-TOKEN-FOR-UNIT-TESTS";

/**
 * Собирает initData так же, как Telegram: из подписываемой строки исключается
 * только hash; signature (Ed25519 для сторонней проверки) в неё входит.
 */
function signInitData(params, token = BOT_TOKEN) {
  const pairs = Object.entries(params)
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const search = new URLSearchParams(Object.entries(params));
  search.set("hash", hash);
  return search.toString();
}

function freshParams(overrides = {}) {
  return {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAF-test",
    signature: "AbCdEf_dummy-ed25519-signature",
    user: JSON.stringify({ id: 42424242, first_name: "Марина" }),
    ...overrides,
  };
}

test("корректно подписанные данные проходят проверку", () => {
  assert.doesNotThrow(() => validate(signInitData(freshParams()), BOT_TOKEN, { expiresIn: 3600 }));
});

test("подделанные данные отклоняются: подпись не сходится", () => {
  const signed = signInitData(freshParams());
  const tampered = new URLSearchParams(signed);
  tampered.set("user", JSON.stringify({ id: 99999999, first_name: "Чужой" }));
  assert.throws(() => validate(tampered.toString(), BOT_TOKEN, { expiresIn: 3600 }));
});

test("подпись чужим токеном отклоняется", () => {
  const signed = signInitData(freshParams(), "999999:ANOTHER-BOT-TOKEN");
  assert.throws(() => validate(signed, BOT_TOKEN, { expiresIn: 3600 }));
});

test("просроченные данные отклоняются", () => {
  const old = String(Math.floor(Date.now() / 1000) - 7200);
  assert.throws(() => validate(signInitData(freshParams({ auth_date: old })), BOT_TOKEN, { expiresIn: 3600 }));
});

test("данные без подписи отклоняются", () => {
  const params = new URLSearchParams(freshParams());
  assert.throws(() => validate(params.toString(), BOT_TOKEN, { expiresIn: 3600 }));
});

test("пустая строка отклоняется", () => {
  assert.throws(() => validate("", BOT_TOKEN, { expiresIn: 3600 }));
});
