import assert from "node:assert/strict";
import { test } from "node:test";
import { botTransport } from "../lib/bot/transport.ts";

/**
 * Выбор транспорта делается автоматически, и ошибка в нём выглядит как
 * «бот молчит без причины» — самый дорогой класс отказов в этом проекте.
 * Поэтому правило зафиксировано тестами.
 */

function withEnv(vars, run) {
  const saved = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("за прокси забираем сообщения сами", () => {
  // Если для исходящих нужен прокси, входящие до нас тоже не дойдут:
  // блокировка симметрична. Ровно это и случилось на боевом сервере.
  withEnv({ TELEGRAM_API_BASE: "https://proxy.techperevod.com/api", TELEGRAM_BOT_TRANSPORT: undefined }, () => {
    assert.equal(botTransport(), "polling");
  });
});

test("без прокси верим вебхуку", () => {
  withEnv({ TELEGRAM_API_BASE: undefined, TELEGRAM_BOT_TRANSPORT: undefined }, () => {
    assert.equal(botTransport(), "webhook");
  });
});

test("прямой адрес Telegram — это «прокси нет»", () => {
  withEnv({ TELEGRAM_API_BASE: "https://api.telegram.org", TELEGRAM_BOT_TRANSPORT: undefined }, () => {
    assert.equal(botTransport(), "webhook");
  });
});

test("пустая строка не считается прокси", () => {
  // В .env легко оставить ключ без значения — это не повод менять поведение.
  withEnv({ TELEGRAM_API_BASE: "   ", TELEGRAM_BOT_TRANSPORT: undefined }, () => {
    assert.equal(botTransport(), "webhook");
  });
});

test("явная настройка перекрывает умолчание в обе стороны", () => {
  withEnv({ TELEGRAM_API_BASE: "https://proxy.techperevod.com/api", TELEGRAM_BOT_TRANSPORT: "webhook" }, () => {
    assert.equal(botTransport(), "webhook");
  });
  withEnv({ TELEGRAM_API_BASE: undefined, TELEGRAM_BOT_TRANSPORT: "polling" }, () => {
    assert.equal(botTransport(), "polling");
  });
  withEnv({ TELEGRAM_API_BASE: undefined, TELEGRAM_BOT_TRANSPORT: "  POLLING  " }, () => {
    assert.equal(botTransport(), "polling");
  });
});

test("мусор в настройке не ломает выбор, а откатывается к умолчанию", () => {
  withEnv({ TELEGRAM_API_BASE: undefined, TELEGRAM_BOT_TRANSPORT: "ерунда" }, () => {
    assert.equal(botTransport(), "webhook");
  });
});
