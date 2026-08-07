import assert from "node:assert/strict";
import { test } from "node:test";
import { botLinks, inboxButton, openAppButton } from "../lib/bot/links.ts";
import { setBotProblemSink } from "../lib/bot/health.ts";

/**
 * Негодный адрес Mini App выключает кнопку, а не сообщение.
 *
 * Проверка написана по факту двухдневного разбора «бот молчит на /start».
 * В TELEGRAM_MINIAPP_URL попала строка из .env целиком, вместе с именем
 * переменной. Telegram проверяет разметку до отправки и отвергает всё
 * сообщение из-за одной негодной кнопки — а кнопку эту несёт как раз
 * приветствие. Снаружи это выглядело как полностью неработающий бот.
 */

function withEnv(value, run) {
  const before = process.env.TELEGRAM_MINIAPP_URL;
  if (value === null) delete process.env.TELEGRAM_MINIAPP_URL;
  else process.env.TELEGRAM_MINIAPP_URL = value;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.TELEGRAM_MINIAPP_URL;
    else process.env.TELEGRAM_MINIAPP_URL = before;
  }
}

test("имя переменной внутри значения выключает кнопку Mini App", () => {
  const seen = [];
  setBotProblemSink((message) => seen.push(message));
  try {
    const links = withEnv("TELEGRAM_MINIAPP_URL=https://jivoetelo.ru/tg", botLinks);
    assert.equal(links.miniAppUrl, null);

    // Кнопка остаётся, но обычной ссылкой: человек попадает в тот же инбокс
    // через браузер, а сообщение доходит.
    const button = openAppButton(links);
    assert.equal(button.url, links.inboxUrl);
    assert.ok(!("web_app" in button));

    assert.equal(seen.length, 1, "молчаливая подмена — то, из-за чего разбор и затянулся");
    assert.match(seen[0], /TELEGRAM_MINIAPP_URL/);
  } finally {
    setBotProblemSink(null);
  }
});

test("любой не-https адрес отвергается так же", () => {
  for (const bad of ["jivoetelo.ru/tg", "http://jivoetelo.ru/tg", "тут был адрес"]) {
    assert.equal(withEnv(bad, botLinks).miniAppUrl, null, bad);
  }
});

test("настоящий адрес работает, хвостовая косая снимается", () => {
  const links = withEnv("https://jivoetelo.ru/tg/", botLinks);
  assert.equal(links.miniAppUrl, "https://jivoetelo.ru/tg");
  assert.deepEqual(inboxButton(links), { text: "Разобрать", web_app: { url: "https://jivoetelo.ru/tg" } });
});

test("пустая переменная — это не поломка, а «Mini App не заведено»", () => {
  const seen = [];
  setBotProblemSink((message) => seen.push(message));
  try {
    assert.equal(withEnv(null, botLinks).miniAppUrl, null);
    assert.equal(withEnv("  ", botLinks).miniAppUrl, null);
    assert.equal(seen.length, 0, "жаловаться тут не на что: переменная необязательная");
  } finally {
    setBotProblemSink(null);
  }
});
