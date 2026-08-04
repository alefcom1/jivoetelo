import assert from "node:assert/strict";
import { test } from "node:test";
import { shiftDay } from "../lib/dates.ts";
import { MASCOT_NAME_RU, MOOD_LABELS, mascotReminderLine, mascotSpeech } from "../lib/mascot.ts";
import { computeStreak } from "../lib/streak.ts";

const TODAY = "2026-03-18";

function run(last, count) {
  const days = [];
  for (let i = 0; i < count; i += 1) days.push(shiftDay(last, -i));
  return days;
}

/** По одному характерному состоянию на каждое настроение. */
const CASES = {
  happy: computeStreak(run(TODAY, 9), TODAY),
  calm: computeStreak(run(shiftDay(TODAY, -1), 9), TODAY),
  frozen: computeStreak(run(shiftDay(TODAY, -2), 9), TODAY),
  missed: computeStreak(run(shiftDay(TODAY, -4), 9), TODAY),
  asleep: computeStreak(run(shiftDay(TODAY, -20), 30), TODAY),
  newbie: computeStreak([], TODAY),
};

test("состояния разложились так, как задумано", () => {
  assert.equal(CASES.happy.mood, "happy");
  assert.equal(CASES.calm.mood, "calm");
  assert.equal(CASES.frozen.mood, "frozen");
  assert.equal(CASES.missed.mood, "missed");
  assert.equal(CASES.asleep.mood, "asleep");
  assert.equal(CASES.newbie.mood, "calm");
});

/**
 * Главная проверка модуля, и она не про буквы. Хрупкий счётчик мы поставили
 * при письменном обещании, что он не будет вызывать вину (docs/product-spec.md,
 * 4.2). Обещание держится ровно одной вещью: енот нигде не переходит на «вы»
 * в связке с пропуском. Стоит кому-нибудь позже написать «вы пропустили день»
 * — обещание нарушено, и тест обязан это поймать.
 */
const BLAMING = [
  /\bвы\s+(пропустил|забыл|сорвал|потерял)/i,
  /\bвам\s+сто[ий]т\b/i,
  /\bнужно\s+было\b/i,
  /\bне\s+забывайте\b/i,
  /\bпочему\s+вы\b/i,
  /\bсгорел/i,
  /\bпотеряли\b/i,
];

test("енот нигде не обвиняет человека в пропуске", () => {
  for (const [name, streak] of Object.entries(CASES)) {
    const speech = mascotSpeech(streak);
    const text = [speech.title, speech.note, speech.milestone ?? "", mascotReminderLine(streak) ?? ""].join(" ");
    for (const pattern of BLAMING) {
      assert.ok(!pattern.test(text), `состояние ${name}: обвиняющая формулировка ${pattern} в «${text}»`);
    }
  }
});

test("на каждое состояние есть непустая реплика и подпись картинки", () => {
  for (const [name, streak] of Object.entries(CASES)) {
    const speech = mascotSpeech(streak);
    assert.ok(speech.title.trim().length > 0, `${name}: пустой заголовок`);
    assert.ok(speech.note.trim().length > 10, `${name}: пустая реплика`);
    assert.ok(MOOD_LABELS[speech.mood], `${name}: нет подписи для настроения ${speech.mood}`);
  }
});

test("после пропуска енот берёт вину на себя и напоминает, что осталось", () => {
  const speech = mascotSpeech(CASES.missed);
  assert.match(speech.note, /^Я тоже/, `получили «${speech.note}»`);
  assert.match(speech.note, /9 дней с записями/, "накопленные дни должны быть названы прямо");
});

test("про заморозку говорится как про общий выходной, и остаток честный", () => {
  const speech = mascotSpeech(CASES.frozen);
  assert.match(speech.note, /выходной/);
  assert.match(speech.note, /1 заморозка/, `остаток должен быть согласован: «${speech.note}»`);
});

test("новичка встречают приветствием, а не нулём", () => {
  const speech = mascotSpeech(CASES.newbie);
  assert.match(speech.title, new RegExp(MASCOT_NAME_RU));
  assert.ok(!/\b0\b/.test(speech.note), `в реплике новичку не место нулю: «${speech.note}»`);
});

test("веха называет то, что открылось, а не хвалит", () => {
  const seven = computeStreak(run(TODAY, 7), TODAY);
  const speech = mascotSpeech(seven);
  assert.match(speech.milestone, /^Открылось: /);
  assert.ok(!/молодец|отличн|поздравля/i.test(speech.milestone), `похвала вместо факта: «${speech.milestone}»`);

  // В обычный день подписи нет вовсе.
  assert.equal(mascotSpeech(CASES.happy).milestone, null);
});

test("боту енот пишет только тогда, когда есть что сказать", () => {
  // День записан — повода писать нет.
  assert.equal(mascotReminderLine(CASES.happy), null);
  // И в день взятой вехи тоже: про неё человек уже прочитал на экране.
  assert.equal(mascotReminderLine(computeStreak(run(TODAY, 7), TODAY)), null);

  for (const name of ["calm", "frozen", "missed"]) {
    const line = mascotReminderLine(CASES[name]);
    assert.ok(line && line.length > 0, `состояние ${name}: боту нечего сказать`);
    // Разметка бота — HTML, и теги должны быть парными: незакрытый <b>
    // Telegram отвергает целиком, и напоминание молча не доходит.
    assert.equal((line.match(/<b>/g) ?? []).length, (line.match(/<\/b>/g) ?? []).length, `${name}: непарный <b>`);
  }
});

test("числа в репликах согласованы с числительными", () => {
  for (const days of [1, 2, 5, 11, 21, 22, 25, 101]) {
    const note = mascotSpeech(computeStreak(run(TODAY, days), TODAY)).title;
    assert.ok(!/\d+ день подряд$/.test(note) || days % 10 === 1, `«${note}» при ${days} днях`);
  }
  assert.equal(mascotSpeech(computeStreak(run(TODAY, 1), TODAY)).title, "1 день подряд");
  assert.equal(mascotSpeech(computeStreak(run(TODAY, 2), TODAY)).title, "2 дня подряд");
  assert.equal(mascotSpeech(computeStreak(run(TODAY, 11), TODAY)).title, "11 дней подряд");
  assert.equal(mascotSpeech(computeStreak(run(TODAY, 21), TODAY)).title, "21 день подряд");
});
