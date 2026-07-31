import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import jsQR from "jsqr";
import { botLink, BOT_USERNAME, isStartPayload, START_PAYLOADS } from "../lib/bot-public.ts";

/**
 * QR печатают на экране и наводят камеру — ошибиться в нём нельзя незаметно:
 * неверный код выглядит ровно так же, как верный. Поэтому здесь код
 * действительно декодируется обратно, а не сверяется размер файла.
 */

async function decode(file) {
  const { data, info } = await sharp(`public/qr/${file}`).resize(400).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}

test("QR ведут туда, куда написано", async () => {
  assert.equal(await decode("bot.svg"), botLink());
  assert.equal(await decode("bot-plan.svg"), botLink(START_PAYLOADS.plan));
  assert.equal(await decode("bot-web.svg"), botLink(START_PAYLOADS.web));
});

test("ссылка собирается на настоящего бота", () => {
  assert.equal(BOT_USERNAME, "jivelo_bot");
  assert.equal(botLink(), "https://t.me/jivelo_bot");
  assert.equal(botLink("plan"), "https://t.me/jivelo_bot?start=plan");
});

test("метки диплинков узнаются, а посторонние — нет", () => {
  // Метка приходит из адреса, то есть от пользователя. Незнакомую нельзя
  // молча принимать за свою: приветствие бота зависит от неё.
  for (const payload of Object.values(START_PAYLOADS)) assert.ok(isStartPayload(payload));
  assert.ok(!isStartPayload("A1B2C3D4"));
  assert.ok(!isStartPayload(""));
  assert.ok(!isStartPayload("plan_"));
});

test("в публичном модуле бота нет ничего секретного", () => {
  // Модуль импортируется клиентскими компонентами и уезжает в браузер.
  const url = botLink("plan");
  assert.doesNotMatch(url, /\d{8,}:/, "токен бота имеет вид 123456789:AA... — его тут быть не может");
});
