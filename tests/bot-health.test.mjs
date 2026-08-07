import test from "node:test";
import assert from "node:assert/strict";

import { botVerdict } from "../lib/bot/health.ts";

/**
 * Вердикт о состоянии бота. Модуль появился после двухдневного разбора
 * «бот молчит», в котором причина так и не нашлась, — и проверять его надо
 * ровно на тех состояниях, которые тогда были возможны.
 */

const NOW = new Date("2026-08-07T10:00:00Z");

function state(patch = {}) {
  return {
    transport: "polling",
    hasToken: true,
    hasApiBase: true,
    startedAt: new Date("2026-08-07T09:00:00Z"),
    lastPollAt: new Date("2026-08-07T09:59:40Z"),
    lastUpdateAt: null,
    lastError: null,
    notStartedReason: null,
    ...patch,
  };
}

test("живой опрос — единственное состояние, которое считается рабочим", () => {
  const verdict = botVerdict(NOW, state());
  assert.equal(verdict.ok, true);
});

test("вебхук на нашем сервере — это и есть молчание", () => {
  // С российского VPS Telegram до нас не достучится, поэтому режим вебхука
  // здесь не «другой вариант», а диагноз.
  const verdict = botVerdict(NOW, state({ transport: "webhook" }));
  assert.equal(verdict.ok, false);
  assert.match(verdict.text, /TELEGRAM_API_BASE/);
});

test("застрявший цикл виден по сердцебиению", () => {
  // Длинный запрос висит 25 с, максимальная пауза после сбоя — минута.
  // Полторы минуты — ещё норма, десять — уже застрял.
  assert.equal(botVerdict(NOW, state({ lastPollAt: new Date("2026-08-07T09:58:30Z") })).ok, true);
  const stuck = botVerdict(NOW, state({ lastPollAt: new Date("2026-08-07T09:50:00Z") }));
  assert.equal(stuck.ok, false);
  assert.match(stuck.text, /застрял/);
});

test("не запустившийся бот называет причину, а не молчит", () => {
  // Ровно тот отказ, который раньше не оставлял в логе ни строчки.
  const verdict = botVerdict(NOW, state({ notStartedReason: "TELEGRAM_BOT_TOKEN не задан в окружении контейнера — бот не запущен." }));
  assert.equal(verdict.ok, false);
  assert.match(verdict.text, /TELEGRAM_BOT_TOKEN/);
});

test("бот, не запускавшийся вовсе, отличается от сломавшегося", () => {
  const verdict = botVerdict(NOW, state({ transport: null, startedAt: null, lastPollAt: null }));
  assert.equal(verdict.ok, false);
  assert.match(verdict.text, /instrumentation/);
});

test("опрос без единого удачного запроса — не «работает»", () => {
  const verdict = botVerdict(NOW, state({ lastPollAt: null }));
  assert.equal(verdict.ok, false);
  assert.match(verdict.text, /ни один запрос/);
});

// ===== Взгляд со стороны Telegram =====
//
// Добавлено после того, как страница дважды соврала о собственном процессе:
// сначала читая память из чужого бандла, потом читая process.env, вшитый при
// сборке. Очередь на стороне Telegram обмануть эти два дефекта не могут.

test("копящаяся очередь без вебхука — поломка, что бы мы о себе ни думали", () => {
  // Ровно то, что показала админка на боевом: вебхука нет, сообщение висит,
  // а наше состояние пустое, потому что писать его было некому.
  const verdict = botVerdict(NOW, state({ transport: null, lastPollAt: null }), {
    webhookUrl: null,
    pending: 1,
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.text, /getUpdates никто не вызывает/);
  // И отдельно — что канал до Telegram при этом рабочий: сам факт ответа
  // getWebhookInfo это доказывает, и вывод обязан это назвать.
  assert.match(verdict.text, /Токен и канал до Bot API при этом рабочие/);
});

test("очередь при живом опросе поломкой не считается", () => {
  // Сообщения могли прийти секунду назад и ещё не быть забранными.
  const verdict = botVerdict(NOW, state(), { webhookUrl: null, pending: 3 });
  assert.equal(verdict.ok, true);
});

test("очередь при зарегистрированном вебхуке — не наш случай", () => {
  // Тут забирать должен Telegram, и вывод про getUpdates был бы неверным.
  const verdict = botVerdict(NOW, state({ transport: "webhook", lastPollAt: null }), {
    webhookUrl: "https://jivoetelo.ru/api/tg/webhook",
    pending: 5,
  });
  assert.doesNotMatch(verdict.text, /getUpdates никто не вызывает/);
});
