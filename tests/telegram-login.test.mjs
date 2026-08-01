import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { test } from "node:test";
import { botUsername, TelegramAuthError, verifyLoginWidget } from "../lib/telegram-auth.ts";

/**
 * Кнопка «Войти через Telegram» на сайте.
 *
 * Проверять её особенно важно по двум причинам. Во-первых, это код входа:
 * ошибка здесь пускает в чужой аккаунт. Во-вторых, подпись у виджета
 * считается НЕ так, как у Mini App, — ключ HMAC другой, — и перепутать их
 * очень легко, потому что данные снаружи похожи.
 */

const TOKEN = "123456:TEST-BOT-TOKEN-FOR-UNIT-TESTS";

function withToken(value, run) {
  const saved = process.env.TELEGRAM_BOT_TOKEN;
  if (value === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = value;
  try {
    return run();
  } finally {
    if (saved === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = saved;
  }
}

/** Подписываем так же, как это делает Telegram: ключ — SHA256 от токена. */
function sign(fields, token = TOKEN) {
  const checkString = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = createHash("sha256").update(token).digest();
  return { ...fields, hash: createHmac("sha256", secret).update(checkString).digest("hex") };
}

const now = new Date("2026-08-01T09:00:00Z");
const authDate = String(Math.floor(now.getTime() / 1000) - 60);
const VALID = { id: "730001", first_name: "Марина", username: "marina", auth_date: authDate };

function rejects(data, when = now) {
  assert.throws(
    () => withToken(TOKEN, () => verifyLoginWidget(data, when)),
    (error) => error instanceof TelegramAuthError && error.reason === "invalid_signature",
  );
}

test("подписанные Telegram данные принимаются", () => {
  const identity = withToken(TOKEN, () => verifyLoginWidget(sign(VALID), now));
  assert.equal(identity.telegramUserId, "730001");
  assert.equal(identity.firstName, "Марина");
});

test("подпись ключом Mini App не принимается", () => {
  // Ровно та ошибка, ради которой этот тест и написан: у initData ключ —
  // HMAC("WebAppData", токен), у виджета — SHA256(токен). Перепутав их,
  // получаешь код, который либо всегда отказывает, либо всегда пускает.
  const checkString = Object.keys(VALID).sort().map((k) => `${k}=${VALID[k]}`).join("\n");
  const miniAppSecret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  const hash = createHmac("sha256", miniAppSecret).update(checkString).digest("hex");
  rejects({ ...VALID, hash });
});

test("подмена любого поля ломает подпись", () => {
  const signed = sign(VALID);
  rejects({ ...signed, id: "999999" });
  rejects({ ...signed, first_name: "Кто-то другой" });
  rejects({ ...signed, auth_date: String(Number(authDate) + 1) });
});

test("лишнее поле, дописанное после подписи, ломает её", () => {
  // Иначе можно было бы дописать что угодно к подлинному ответу Telegram.
  rejects({ ...sign(VALID), photo_url: "https://example.com/a.jpg" });
});

test("подпись чужим ботом не принимается", () => {
  rejects(sign(VALID, "999999:SOMEONE-ELSES-BOT-TOKEN"));
});

test("данные без подписи не принимаются", () => {
  rejects(VALID);
  rejects({ ...VALID, hash: "" });
});

test("подпись не той длины не принимается", () => {
  // timingSafeEqual бросает на разной длине буферов — это должно быть
  // отказом, а не падением маршрута с пятисоткой.
  rejects({ ...VALID, hash: "abcd" });
  rejects({ ...VALID, hash: "не-шестнадцатеричная строка" });
});

test("старый ответ не работает вечно", () => {
  // Подпись верна всегда, поэтому давность проверяем сами: иначе однажды
  // подсмотренный ответ Telegram служил бы паролем без срока годности.
  const old = sign({ ...VALID, auth_date: String(Math.floor(now.getTime() / 1000) - 7200) });
  rejects(old);
});

test("ответ из будущего не работает тоже", () => {
  const ahead = sign({ ...VALID, auth_date: String(Math.floor(now.getTime() / 1000) + 7200) });
  rejects(ahead);
});

test("без токена бота вход недоступен, а не открыт", () => {
  assert.throws(
    () => withToken(undefined, () => verifyLoginWidget(sign(VALID), now)),
    (error) => error instanceof TelegramAuthError && error.reason === "not_configured",
  );
});

test("имя бота читается из окружения и чистится от собачки", () => {
  const saved = process.env.TELEGRAM_BOT_USERNAME;
  try {
    process.env.TELEGRAM_BOT_USERNAME = "@jivelo_bot";
    assert.equal(botUsername(), "jivelo_bot");
    process.env.TELEGRAM_BOT_USERNAME = "  jivelo_bot  ";
    assert.equal(botUsername(), "jivelo_bot");
    // Пусто — кнопки нет вовсе. Виджет с чужим именем молча не сработал бы,
    // и человек жал бы на него, не понимая, почему ничего не происходит.
    process.env.TELEGRAM_BOT_USERNAME = "";
    assert.equal(botUsername(), null);
    delete process.env.TELEGRAM_BOT_USERNAME;
    assert.equal(botUsername(), null);
  } finally {
    if (saved === undefined) delete process.env.TELEGRAM_BOT_USERNAME;
    else process.env.TELEGRAM_BOT_USERNAME = saved;
  }
});
