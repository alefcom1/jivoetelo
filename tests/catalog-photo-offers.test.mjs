import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PHOTO_STATUSES, buildCaption, PHOTO_CREDIT } from "../lib/catalog-photos.ts";

/**
 * Банк снимков: что здесь сторожится и почему именно это.
 *
 * Очередь модерации годами стояла пустой, и причина была не в ошибке: путь в
 * каталог вёл из карточки приёма пищи руками автора — найти запись, выбрать
 * продукт, поставить галочку, отправить. Четыре шага, и их не делал никто.
 *
 * Починка была очевидной и неправильной: собирать всё и публиковать по
 * умолчанию, а несогласным дать выключатель. Правильная — предлагать самим,
 * но спрашивать по конкретному кадру. Разница между двумя вариантами не
 * видна ни на одном экране, зато видна в законе: 152-ФЗ, ст. 10.1 ч. 8 прямо
 * говорит, что молчание и бездействие согласием на распространение не
 * считаются ни при каких обстоятельствах.
 *
 * Поэтому проверки ниже смотрят на то, чего не должно появиться, а не на то,
 * что работает: сломать это можно одной строкой, и снаружи поломка будет
 * выглядеть как «наконец-то снимки в каталоге появились сами».
 */

test("у снимка есть состояние «предложен» — до согласия и до модерации", () => {
  assert.ok(PHOTO_STATUSES.includes("offered"), "нечем отличить предложенный снимок от согласованного");
  // Порядок важен: `offered` идёт до `pending`. Предложение — это ещё не
  // очередь на публикацию, это вопрос автору.
  assert.ok(
    PHOTO_STATUSES.indexOf("offered") < PHOTO_STATUSES.indexOf("pending"),
    "предложение должно стоять до очереди модерации",
  );
});

test("предложение не создаёт согласия — оно появляется только с ответом", async () => {
  const source = await readFile(new URL("../lib/catalog-photos-store.ts", import.meta.url), "utf8");
  const offer = source.slice(source.indexOf("export async function offerPhoto"));
  const body = offer.slice(0, offer.indexOf("\n}\n"));

  assert.ok(
    !body.includes("userConsents"),
    "offerPhoto пишет согласие — значит человек «согласился» тем, что его спросили",
  );
  assert.ok(
    !body.includes("consentVersion"),
    "у предложения проставляется редакция документов — это утверждение задним числом, что автор на неё соглашался",
  );
  assert.ok(body.includes('status: "offered"'), "предложение обязано создаваться в состоянии «предложен»");
});

test("публикация не наступает от бездействия автора", async () => {
  const source = await readFile(new URL("../lib/catalog-photos-store.ts", import.meta.url), "utf8");
  const answer = source.slice(source.indexOf("export async function answerOffer"));
  const body = answer.slice(0, answer.indexOf("\n}\n"));

  // Согласие пишется в ветке «да» и только там. Если однажды кто-то вынесет
  // запись согласия перед проверкой `agree`, отказ автора начнёт создавать
  // согласие — тихо и без единой заметной ошибки.
  const agreeAt = body.indexOf("if (!agree)");
  const consentAt = body.indexOf("userConsents");
  assert.ok(agreeAt > 0, "в ответе автора нет ветки отказа");
  assert.ok(consentAt > agreeAt, "согласие пишется до проверки ответа — отказ тоже станет согласием");

  assert.ok(
    body.includes('status: "rejected"'),
    "отказ должен помечать кадр отвеченным, иначе его предложат снова",
  );
  // Не сразу `approved`: модератор смотрел кадр в дневнике, но подпись и
  // привязку к продукту ставил без второго взгляда, а публикуется эта пара.
  assert.ok(!body.includes('status: "approved"'), "ответ автора не должен публиковать снимок минуя модерацию");
});

test("выключатель убирает человека из очереди кандидатов, а не только из показа", async () => {
  const source = await readFile(new URL("../lib/catalog-photos-store.ts", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("export async function photoCandidates"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(
    body.includes("photoOffersOptOut"),
    "кандидаты не фильтруются по запрету — модератор увидит снимки того, кто просил не предлагать",
  );
});

test("подпись описывает еду и не называет автора", () => {
  assert.equal(buildCaption("Творог 5%", 150), "Творог 5%, порция 150 г");
  assert.equal(buildCaption("Творог 5%", 0), "Творог 5%");
  // Человек соглашался на публикацию снимка еды, а не на то, чтобы его имя
  // стояло рядом с его же рационом.
  assert.ok(!PHOTO_CREDIT.includes("{"), "в атрибуции не должно быть подстановок с именем");
  assert.match(PHOTO_CREDIT, /читател/i);
});
