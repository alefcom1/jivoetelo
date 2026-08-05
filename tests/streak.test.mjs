import assert from "node:assert/strict";
import { test } from "node:test";
import { shiftDay } from "../lib/dates.ts";
import {
  computeStreak,
  MAX_CONSECUTIVE_FREEZES,
  MILESTONES,
  MONTHLY_FREEZES,
  SLEEP_AFTER_DAYS,
} from "../lib/streak.ts";

/** Подряд идущие дни, заканчивающиеся на `last`. */
function run(last, count) {
  const days = [];
  for (let i = 0; i < count; i += 1) days.push(shiftDay(last, -i));
  return days;
}

test("сегодняшний день входит в серию, только если он записан", () => {
  const today = "2026-03-18";
  const withToday = computeStreak(run(today, 5), today);
  assert.equal(withToday.current, 5);
  assert.equal(withToday.loggedToday, true);
  assert.equal(withToday.mood, "happy");

  // Тот же человек в девять утра: сегодня ещё пусто, но серия жива. Обнулять
  // её в начале дня — значит требовать записи до завтрака.
  const morning = computeStreak(run(shiftDay(today, -1), 5), today);
  assert.equal(morning.current, 5);
  assert.equal(morning.loggedToday, false);
  assert.equal(morning.mood, "calm");
});

test("один пропуск закрывается заморозкой молча — серия не рвётся", () => {
  const today = "2026-03-18";
  // Записи: today и всё до позавчера. Вчера пропущено.
  const days = [today, ...run(shiftDay(today, -2), 9)];
  const streak = computeStreak(days, today);

  assert.equal(streak.current, 10, "серия должна продолжиться через пропуск");
  assert.deepEqual(streak.frozenDays, [shiftDay(today, -1)]);
  assert.equal(streak.freezesLeft, MONTHLY_FREEZES - 1);
  // Сегодня записано — значит енот рад, а не «в заморозке»: напоминать о
  // вчерашнем пропуске, когда сегодня уже всё сделано, незачем.
  assert.equal(streak.mood, "happy");
});

test("вчерашний пропуск виден, пока сегодня пусто", () => {
  const today = "2026-03-18";
  const streak = computeStreak(run(shiftDay(today, -2), 6), today);
  assert.equal(streak.current, 6);
  assert.deepEqual(streak.frozenDays, [shiftDay(today, -1)]);
  assert.equal(streak.mood, "frozen");
});

test("две заморозки подряд — предел, третий пропущенный день рвёт серию", () => {
  const today = "2026-03-20";
  // Пропущены 17, 18 и 19-е; последняя запись — 16-го. Сегодняшний день в
  // счёт не идёт: он ещё не кончился.
  const streak = computeStreak(run("2026-03-16", 12), today);
  assert.equal(streak.current, 0, "три дня подряд — это не оступился, это уехал");
  assert.deepEqual(streak.frozenDays, []);
  assert.equal(streak.mood, "missed");
  // Бюджет не тронут: заморозки, которые ничего не спасли, не списываются.
  assert.equal(streak.freezesLeft, MONTHLY_FREEZES);
});

test("выходные в отъезде — ровно тот случай, ради которого заморозки и есть", () => {
  const today = "2026-03-16"; // понедельник, человек вернулся и записал день
  const days = [today, ...run("2026-03-13", 20)]; // пропущены сб и вс
  const streak = computeStreak(days, today);

  assert.equal(streak.current, 21);
  assert.equal(streak.frozenDays.length, MAX_CONSECUTIVE_FREEZES);
  assert.equal(streak.freezesLeft, 0, "месячный бюджет ушёл целиком на эти выходные");
});

test("бюджет заморозок считается по календарным месяцам", () => {
  // Пропуск на стыке месяцев: 31 марта и 1 апреля. Каждый день берёт
  // заморозку из своего месяца, поэтому апрельский бюджет почти цел.
  const today = "2026-04-02";
  const days = [today, ...run("2026-03-30", 10)];
  const streak = computeStreak(days, today);

  assert.equal(streak.current, 11);
  assert.deepEqual(streak.frozenDays, ["2026-04-01", "2026-03-31"]);
  assert.equal(streak.freezesLeft, MONTHLY_FREEZES - 1, "в апреле потрачена одна");
});

test("оборванная серия ничего не отнимает: дни и вехи остаются", () => {
  const today = "2026-03-25";
  // 40 дней записей, но последняя — неделю назад.
  const days = run("2026-03-18", 40);
  const streak = computeStreak(days, today);

  assert.equal(streak.current, 0);
  assert.equal(streak.totalDays, 40, "счётчик дней не обнуляется вместе с серией");
  assert.equal(streak.next.days, 60, "веха 30 дней взята и остаётся взятой");
  assert.equal(streak.daysToNext, 20);
});

test("вехи считаются по дням с записями, а не по серии", () => {
  const today = "2026-03-31";
  // Четырнадцать дней вразнобой — через один. Серия при этом короткая.
  const days = [];
  for (let i = 0; i < 14; i += 1) days.push(shiftDay(today, -i * 2));
  const streak = computeStreak(days, today);

  assert.equal(streak.totalDays, 14);
  assert.ok(streak.current < 5, `серия здесь короткая, получили ${streak.current}`);
  assert.equal(streak.next.days, 30, "порог «Еда и вес» взят — разбору всё равно, шли ли дни подряд");
});

test("веха поздравляется ровно в тот день, когда взята", () => {
  const today = "2026-03-18";
  const seven = computeStreak(run(today, 7), today);
  assert.equal(seven.reachedToday.days, 7);

  // Назавтра — уже не повод: восьмой день не веха.
  const eight = computeStreak(run(shiftDay(today, 1), 8), shiftDay(today, 1));
  assert.equal(eight.reachedToday, null);

  // И если сегодня ещё не записано, поздравлять не с чем.
  const notYet = computeStreak(run(shiftDay(today, -1), 7), today);
  assert.equal(notYet.reachedToday, null);
});

test("каждая веха обещает что-то конкретное и пороги идут по возрастанию", () => {
  let previous = 0;
  for (const milestone of MILESTONES) {
    assert.ok(milestone.days > previous, `пороги не по возрастанию: ${milestone.days} после ${previous}`);
    previous = milestone.days;
    assert.ok(milestone.title.trim().length > 0, "у вехи нет названия");
    assert.ok(milestone.unlocks.trim().length > 10, `веха «${milestone.title}» ничего не обещает`);
  }
});

test("недели с заботой: три дня записей — неделя засчитана", () => {
  const today = "2026-03-22"; // воскресенье
  // Неделя 16–22 марта: три дня. Неделя 9–15 марта: два дня.
  const days = ["2026-03-16", "2026-03-18", "2026-03-22", "2026-03-10", "2026-03-11"];
  const streak = computeStreak(days, today);
  assert.equal(streak.caringWeeks, 1);
});

test("после долгой тишины енот спит, а не показывает ноль", () => {
  const today = "2026-03-25";
  const longAgo = computeStreak(run(shiftDay(today, -(SLEEP_AFTER_DAYS + 1)), 30), today);
  assert.equal(longAgo.mood, "asleep");
  assert.equal(longAgo.totalDays, 30, "дни на месте, просто про них давно не вспоминали");

  // А новичок — не «давно молчит»: он ещё не начинал, и спящий енот на первом
  // экране читался бы как упрёк за то, чего не было.
  assert.equal(computeStreak([], today).mood, "calm");
});

test("пустой и мусорный вход не ломают счёт", () => {
  const today = "2026-03-18";
  const empty = computeStreak([], today);
  assert.equal(empty.current, 0);
  assert.equal(empty.totalDays, 0);
  assert.equal(empty.caringWeeks, 0);
  assert.equal(empty.next.days, MILESTONES[0].days);
  assert.equal(empty.freezesLeft, MONTHLY_FREEZES);

  const dirty = computeStreak([today, today, "", "не дата", "2026-13-40"], today);
  assert.equal(dirty.totalDays, 1, "дубли и мусор не должны раздувать счётчик");
});

test("серия длиной в год считается без обрывов и не зависает", () => {
  const today = "2026-03-18";
  const streak = computeStreak(run(today, 365), today);
  assert.equal(streak.current, 365);
  assert.equal(streak.totalDays, 365);
  assert.equal(streak.next, null, "все вехи взяты");
  assert.equal(streak.daysToNext, null);
});

test("лучшая серия — за всю историю, а не последняя", () => {
  // Ради этого поля всё и заведено: награда считается по нему и потому
  // неотнимаема. Длинная серия год назад должна остаться видна и после
  // месяца пропусков.
  const long = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"];
  const short = ["2026-08-04", "2026-08-05"];
  const result = computeStreak([...long, ...short], "2026-08-05");
  assert.equal(result.bestStreak, 5, "видна только последняя серия");
  assert.equal(result.current, 2, "текущая серия при этом честно короткая");
});

test("лучшая серия не дорисовывается заморозками", () => {
  // Заморозка существует, чтобы не терять живую серию из-за одного дня, а не
  // чтобы переписывать историю.
  const withGap = computeStreak(["2026-08-01", "2026-08-02", "2026-08-04", "2026-08-05"], "2026-08-05");
  assert.equal(withGap.bestStreak, 2);
});

test("у пустой истории лучшая серия — ноль", () => {
  assert.equal(computeStreak([], "2026-08-05").bestStreak, 0);
  assert.equal(computeStreak(["2026-08-05"], "2026-08-05").bestStreak, 1);
});
