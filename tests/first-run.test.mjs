import test from "node:test";
import assert from "node:assert/strict";
import { FIRST_RUN_HINTS, hintSheet, isHintKey, nextHint, passedByData } from "../lib/first-run.ts";
import { mascotImage } from "../lib/mascot.ts";
import { existsSync } from "node:fs";

/**
 * Первые шаги.
 *
 * Главное, что здесь проверяется, — подсказка не вылезает не вовремя. Это
 * единственный способ испортить онбординг необратимо: объяснение, приходящее
 * не к месту, читается как навязчивость, и человек начинает закрывать все
 * подряд не читая.
 */

const NEW_USER = {
  seen: [],
  hasPlan: true,
  loggedDays: 0,
  mealsToday: 0,
  botEverUsed: false,
  hasWeight: false,
  diaryOpened: false,
  showCalories: true,
};

const state = (patch) => ({ ...NEW_USER, ...patch });

/* ===== Порядок и уместность ===== */

test("новичку с планом первым делом говорят про запись", () => {
  const hint = nextHint(NEW_USER);
  assert.equal(hint.key, "firstMeal");
  assert.equal(hint.action.target, "camera");
});

test("пока план не настроен, объяснять нечего", () => {
  // Человек ещё в анкете; подсказки поверх анкеты — это две инструкции сразу.
  assert.equal(nextHint(state({ hasPlan: false })), null);
});

test("подсказка про первую запись не приходит тому, у кого сорок записей", () => {
  // Условие по данным сильнее памяти: даже никогда не показанная подсказка
  // не должна учить тому, что человек уже умеет.
  const veteran = state({ loggedDays: 40, mealsToday: 3, hasWeight: true, botEverUsed: true, diaryOpened: true });
  const hint = nextHint(veteran);
  assert.notEqual(hint?.key, "firstMeal");
});

test("шаги ждут своего состояния, а не идут подряд", () => {
  // У новичка в первый день не должно быть ни слова про неделю и про вес.
  const firstDay = state({ loggedDays: 1, mealsToday: 1, diaryOpened: true });
  const hint = nextHint(firstDay);
  assert.notEqual(hint?.key, "week", "неделя предложена на первый день");
  assert.notEqual(hint?.key, "weight", "вес предложен на первый день");
});

test("за раз показывается ровно одна подсказка", () => {
  // Состояние, где подходят сразу несколько: две на экране — это уже поток
  // сообщений, а не объяснение.
  const many = state({ loggedDays: 3, mealsToday: 2 });
  const hint = nextHint(many);
  assert.ok(hint, "не показано ничего, хотя подходит несколько");
  assert.equal(typeof hint.key, "string");
});

test("показанное не возвращается", () => {
  const hint = nextHint(NEW_USER);
  assert.equal(nextHint(state({ seen: [hint.key] }))?.key ?? null, null);
});

/* ===== Отдельные условия ===== */

test("про кольцо говорят со второй записи за день и только при видимых калориях", () => {
  assert.equal(nextHint(state({ loggedDays: 1, mealsToday: 1, diaryOpened: true }))?.key, undefined);
  assert.equal(nextHint(state({ loggedDays: 1, mealsToday: 2, diaryOpened: true })).key, "ring");
  // В режиме без калорий кольца с числами нет — объяснять нечего.
  assert.notEqual(
    nextHint(state({ loggedDays: 1, mealsToday: 2, diaryOpened: true, showCalories: false }))?.key,
    "ring",
  );
});

test("дневник предлагают, когда в нём уже что-то есть", () => {
  assert.equal(nextHint(state({ loggedDays: 1 })).key, "diary");
  assert.notEqual(nextHint(state({ loggedDays: 1, diaryOpened: true }))?.key, "diary");
});

test("про бота — со второго дня и только тому, кто им не пользовался", () => {
  const day2 = state({ loggedDays: 2, diaryOpened: true, seen: ["ring"] });
  assert.equal(nextHint(day2).key, "bot");
  assert.notEqual(nextHint({ ...day2, botEverUsed: true })?.key, "bot");
});

test("про вес — тому, кто ни разу не взвешивался", () => {
  const s = state({ loggedDays: 2, diaryOpened: true, botEverUsed: true, seen: ["ring"] });
  assert.equal(nextHint(s).key, "weight");
  assert.notEqual(nextHint({ ...s, hasWeight: true })?.key, "weight");
});

test("режим без калорий предлагают не раньше пятого дня", () => {
  // На второй день это выглядело бы как предложение бросить.
  const done = ["firstMeal", "ring", "diary", "bot", "weight", "week"];
  assert.equal(nextHint(state({ loggedDays: 3, seen: done })), null);
  assert.equal(nextHint(state({ loggedDays: 5, seen: done })).key, "calories");
  // Тому, кто уже выключил калории, предлагать нечего.
  assert.equal(nextHint(state({ loggedDays: 5, seen: done, showCalories: false })), null);
});

/* ===== Пройдено по данным ===== */

test("сделанное без подсказки считается пройденным", () => {
  // Тот, кто сфотографировал еду сам, не должен получить подсказку об этом
  // после.
  const passed = passedByData(state({ loggedDays: 3, diaryOpened: true, botEverUsed: true, hasWeight: true }));
  for (const key of ["firstMeal", "diary", "bot", "weight"]) {
    assert.ok(passed.includes(key), `${key} не отмечен пройденным`);
  }
});

test("выключенные калории закрывают оба шага про них", () => {
  const passed = passedByData(state({ showCalories: false }));
  assert.ok(passed.includes("calories"));
  assert.ok(passed.includes("ring"), "кольцо с числами в этом режиме не показывается");
});

test("у новичка не пройдено ничего", () => {
  assert.deepEqual(passedByData(NEW_USER), []);
});

/* ===== Целостность ===== */

test("тексты подсказок не требуют и не подгоняют", () => {
  const FORBIDDEN = [/вы должны/i, /не забудьте/i, /обязательно/i, /нужно срочно/i, /пора /i, /молодец/i];
  for (const key of FIRST_RUN_HINTS) {
    // Собираем состояние, в котором показывается именно этот шаг.
    const hint = allHints().find((h) => h.key === key);
    assert.ok(hint, `шаг ${key} недостижим ни при каком состоянии`);
    for (const bad of FORBIDDEN) {
      assert.ok(!bad.test(hint.text), `«${hint.text}» нарушает ${bad}`);
    }
    assert.ok(!hint.text.includes("!"), `«${hint.text}» — восклицание не в голосе персонажа`);
    assert.ok(hint.text.length <= 130, `«${hint.text}» не влезет в строку`);
  }
});

test("каждый шаг достижим и его поза существует", () => {
  const hints = allHints();
  assert.equal(hints.length, FIRST_RUN_HINTS.length, "не все шаги достижимы");
  for (const hint of hints) {
    assert.ok(
      existsSync(new URL(`../public${mascotImage(hint.pose)}`, import.meta.url)),
      `${hint.key}: нет файла позы ${hint.pose}`,
    );
  }
});

test("кнопка ведёт туда, где действие возможно", () => {
  // Ошибка, которую легко не заметить: «Внести вес» вело на анкету плана,
  // где вес не вносят, а «Посмотреть» неделю — туда же. Кнопка, ведущая не
  // туда, хуже отсутствующей: человек решает, что не нашёл, и не ищет второй раз.
  const byKey = Object.fromEntries(allHints().map((h) => [h.key, h]));
  assert.equal(byKey.weight.action.target, "weight");
  assert.equal(byKey.week.action.target, "week");
  assert.equal(byKey.firstMeal.action.target, "camera");
  assert.equal(byKey.diary.action.target, "diary");
  assert.equal(byKey.calories.action.target, "profile");
});

/* ===== Шпаргалка ===== */

test("в шпаргалке есть каждый шаг и ровно один раз", () => {
  // Забытая запись означает объяснение, которое человек видел мельком и
  // больше не найдёт нигде.
  const sheet = hintSheet();
  assert.deepEqual(sheet.map((e) => e.key), [...FIRST_RUN_HINTS]);
});

test("шпаргалка объясняет подробнее подсказки, а не повторяет её", () => {
  const short = Object.fromEntries(allHints().map((h) => [h.key, h.text]));
  for (const entry of hintSheet()) {
    assert.ok(entry.title.length > 0 && entry.title.length <= 48, `заголовок «${entry.title}» не годится`);
    assert.ok(!entry.title.endsWith("."), `заголовок «${entry.title}» с точкой`);
    assert.ok(
      entry.text.length > short[entry.key].length,
      `${entry.key}: в шпаргалке не больше, чем в подсказке, — тогда она не нужна`,
    );
    assert.notEqual(entry.text, short[entry.key], `${entry.key}: текст скопирован из подсказки`);
  }
});

test("тон шпаргалки тот же, что у подсказок", () => {
  const FORBIDDEN = [/вы должны/i, /не забудьте/i, /обязательно/i, /молодец/i];
  for (const entry of hintSheet()) {
    for (const bad of FORBIDDEN) {
      assert.ok(!bad.test(entry.text), `«${entry.title}» нарушает ${bad}`);
    }
    assert.ok(!entry.text.includes("!"), `«${entry.title}»: восклицание не в голосе персонажа`);
  }
});

test("ключи шагов проверяются перед записью в базу", () => {
  assert.ok(isHintKey("firstMeal"));
  assert.ok(!isHintKey("drop table"));
  assert.ok(!isHintKey(""));
  assert.ok(!isHintKey(null));
  assert.ok(!isHintKey(42));
});

/**
 * Все шаги, до которых можно добраться: перебираем состояния, накапливая
 * `seen`. Заодно это проверка, что ни один шаг не заблокирован другим
 * навсегда.
 */
function allHints() {
  const found = [];
  const seen = [];
  const rich = {
    hasPlan: true, loggedDays: 0, mealsToday: 0,
    botEverUsed: false, hasWeight: false, diaryOpened: false, showCalories: true,
  };
  for (const days of [0, 1, 2, 3, 5]) {
    for (let guard = 0; guard < 10; guard += 1) {
      const hint = nextHint({ ...rich, seen, loggedDays: days, mealsToday: days > 0 ? 2 : 0 });
      if (!hint) break;
      found.push(hint);
      seen.push(hint.key);
    }
  }
  return found;
}
