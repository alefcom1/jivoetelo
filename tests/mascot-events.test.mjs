import test from "node:test";
import assert from "node:assert/strict";
import { mascotEventLine, mascotImage } from "../lib/mascot.ts";
import { existsSync } from "node:fs";

/**
 * Поводы Живело появиться вне карточки серии.
 *
 * Проверяем не «функция вернула строку», а то, ради чего персонаж вообще
 * заведён: он не обвиняет, не хвалит и не говорит о весе. Расширение охвата —
 * ровно тот момент, когда эти правила легче всего нарушить: чем больше мест,
 * тем выше шанс, что в одном из них проскочит «вы опять пропустили».
 */

const ALL_EVENTS = [
  { kind: "analyzed", confidence: "high" },
  { kind: "analyzed", confidence: "medium" },
  { kind: "analyzed", confidence: "low" },
  { kind: "analysisFailed" },
  { kind: "firstEntry" },
  { kind: "backAfterBreak", daysAway: 5 },
  { kind: "backAfterBreak", daysAway: 60 },
  { kind: "emptyDay" },
  { kind: "nothingYet" },
  { kind: "quotaLow", left: 0 },
  { kind: "quotaLow", left: 2 },
  { kind: "weekReady" },
];

/* ===== Правила, которые важнее охвата ===== */

test("енот никого не обвиняет и не оценивает", () => {
  // Список собран из формулировок, запрещённых спецификацией (4.2, 4.3), и
  // из тех, что чаще всего просачиваются в тексты про питание.
  const FORBIDDEN = [
    /вы пропустили/i, /вы опять/i, /вы забыли/i, /вы не /i,
    /молодец/i, /отлично!/i, /умница/i, /горжусь/i,
    /плохо/i, /вредн/i, /запрещ/i, /слишком много/i, /нельзя есть/i,
    /срыв/i, /провал/i, /стыд/i,
  ];
  for (const event of ALL_EVENTS) {
    const line = mascotEventLine(event);
    if (!line) continue;
    for (const bad of FORBIDDEN) {
      assert.ok(!bad.test(line.text), `«${line.text}» нарушает правило ${bad}`);
    }
  }
});

test("енот ничего не говорит о весе — он о нём не знает", () => {
  for (const event of ALL_EVENTS) {
    const line = mascotEventLine(event);
    if (!line) continue;
    assert.ok(
      !/вес|килограмм|кг\b|похуд|сброс|набрал/i.test(line.text),
      `«${line.text}» — енот заговорил о весе`,
    );
  }
});

test("восклицательных знаков нет: тон спокойный", () => {
  for (const event of ALL_EVENTS) {
    const line = mascotEventLine(event);
    if (!line) continue;
    assert.ok(!line.text.includes("!"), `«${line.text}» — восклицание не в голосе персонажа`);
  }
});

/* ===== Реплики по существу ===== */

test("у каждого повода своя поза, и файл этой позы существует", () => {
  for (const event of ALL_EVENTS) {
    const line = mascotEventLine(event);
    if (!line) continue;
    const file = new URL(`../public${mascotImage(line.pose)}`, import.meta.url);
    assert.ok(existsSync(file), `${event.kind}: нет файла позы ${line.pose}`);
  }
});

test("уверенность разбора меняет и позу, и совет", () => {
  const high = mascotEventLine({ kind: "analyzed", confidence: "high" });
  const low = mascotEventLine({ kind: "analyzed", confidence: "low" });
  assert.notEqual(high.pose, low.pose, "уверенный и неуверенный разбор выглядят одинаково");
  assert.notEqual(high.text, low.text);
  // При низкой уверенности человек должен понять, куда смотреть.
  assert.match(low.text, /грамм/i, "при низкой уверенности не сказано, что проверять");
});

test("молчание — тоже ответ", () => {
  // Короткий перерыв не повод здороваться, а полная квота — не повод
  // напоминать о лимитах. Персонаж, который говорит всегда, надоедает.
  assert.equal(mascotEventLine({ kind: "backAfterBreak", daysAway: 1 }), null);
  assert.equal(mascotEventLine({ kind: "backAfterBreak", daysAway: 2 }), null);
  assert.equal(mascotEventLine({ kind: "quotaLow", left: 10 }), null);
});

test("возвращение после долгого перерыва звучит иначе, чем после короткого", () => {
  const week = mascotEventLine({ kind: "backAfterBreak", daysAway: 5 });
  const year = mascotEventLine({ kind: "backAfterBreak", daysAway: 300 });
  assert.notEqual(week.text, year.text);
  for (const line of [week, year]) {
    assert.ok(!/где вы были|наконец/i.test(line.text), `«${line.text}» — упрёк за отсутствие`);
  }
});

test("кончившаяся квота говорит, что делать дальше", () => {
  const out = mascotEventLine({ kind: "quotaLow", left: 0 });
  assert.match(out.text, /рук/i, "не сказано, что запись руками осталась");
});

test("склонение штук не съезжает", () => {
  assert.match(mascotEventLine({ kind: "quotaLow", left: 1 }).text, /1 штука/);
  assert.match(mascotEventLine({ kind: "quotaLow", left: 2 }).text, /2 штуки/);
  assert.match(mascotEventLine({ kind: "quotaLow", left: 3 }).text, /3 штуки/);
});

test("реплики не повторяются дословно между поводами", () => {
  // Одинаковый текст на разные события означает, что один из поводов не
  // додуман и персонаж говорит невпопад.
  const texts = ALL_EVENTS.map(mascotEventLine).filter(Boolean).map((l) => l.text);
  assert.equal(new Set(texts).size, texts.length, "две реплики совпадают дословно");
});

test("реплика короткая: это строка под картинкой, а не абзац", () => {
  for (const event of ALL_EVENTS) {
    const line = mascotEventLine(event);
    if (!line) continue;
    assert.ok(line.text.length <= 110, `«${line.text}» — ${line.text.length} символов, не влезет в строку`);
  }
});
