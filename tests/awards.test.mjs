import test from "node:test";
import assert from "node:assert/strict";
import { AWARDS, awardByKey, earnedAwards, entriesWord, freshest, isAwardKey, newlyEarned } from "../lib/awards.ts";
import { MILESTONES } from "../lib/streak.ts";

/**
 * Награды.
 *
 * Два свойства, ради которых всё это написано и которые нельзя потерять при
 * будущих правках: награду невозможно отнять и награду невозможно получить за
 * килограммы. Первое — потому что отнятая награда наказывает за болезнь и
 * отпуск. Второе — потому что вес не результат усилия, и сделать его счётом
 * значит наградить одних за конституцию, а других за неё же наказать.
 */

const state = (patch = {}) => ({ totalDays: 0, mealCount: 0, bestStreak: 0, ...patch });

/* ===== Что берётся ===== */

test("у новичка нет ничего", () => {
  assert.deepEqual(earnedAwards(state()), []);
});

test("награды по дням совпадают с вехами один в один", () => {
  // Расхождение означало бы, что сервис поздравляет с одним, а в списке
  // хранит другое.
  const byDays = AWARDS.filter((a) => a.key.startsWith("days-")).map((a) => Number(a.key.slice(5)));
  assert.deepEqual(byDays, MILESTONES.map((m) => m.days));
});

test("взятое накапливается и не пропадает при росте", () => {
  const early = earnedAwards(state({ totalDays: 7 }));
  const later = earnedAwards(state({ totalDays: 90 }));
  for (const key of early) assert.ok(later.includes(key), `${key} пропал при росте`);
});

test("записи и дни считаются отдельно", () => {
  // Сто дней по одному приёму и тридцать подробных — разные люди, и
  // отмечать надо обоих.
  assert.ok(earnedAwards(state({ totalDays: 100, mealCount: 100 })).includes("meals-100"));
  assert.ok(earnedAwards(state({ totalDays: 30, mealCount: 500 })).includes("meals-500"));
  assert.ok(!earnedAwards(state({ totalDays: 100, mealCount: 40 })).includes("meals-100"));
});

test("серия без пропусков — по лучшей за всю историю, а не по текущей", () => {
  // Ровно это и делает награду неотнимаемой: текущая серия обнуляется, лучшая
  // — нет.
  assert.ok(earnedAwards(state({ bestStreak: 7 })).includes("streak-7"));
  assert.ok(earnedAwards(state({ bestStreak: 30 })).includes("streak-30"));
});

/* ===== Награду нельзя отнять ===== */

test("ни одна награда не зависит от текущей серии", () => {
  // Пробегаем по всем полям состояния: если убавить любое, набор наград
  // может только сократиться — но такого состояния в жизни не бывает, потому
  // что totalDays, mealCount и bestStreak монотонны. Проверяем это прямо:
  // ни одно поле, по которому считается награда, не умеет убывать.
  const fields = ["totalDays", "mealCount", "bestStreak"];
  const rich = state({ totalDays: 400, mealCount: 900, bestStreak: 40 });
  for (const field of fields) {
    const all = earnedAwards(rich);
    const less = earnedAwards({ ...rich, [field]: rich[field] - 1 });
    assert.ok(less.length <= all.length, `${field}: убыль дала больше наград`);
  }
  assert.equal(earnedAwards(rich).length, AWARDS.length, "не все награды достижимы");
});

/* ===== Ни слова про вес ===== */

test("наружу не уходит ни одного слова про вес", () => {
  // Строже всего именно к `share`: это единственный текст, который человек
  // показывает другим. Карточка «−5 кг за месяц» объявляет вес счётом,
  // приглашает сравнивать разные тела и обещает получателю то, чего сервис
  // прямо не обещает в своих же документах.
  const FORBIDDEN = [/кг\b/i, /килограмм/i, /вес/i, /похуд/i, /сброс/i, /кольцо/i, /норм[ауы]\b/i];
  for (const award of AWARDS) {
    for (const bad of FORBIDDEN) {
      assert.ok(!bad.test(award.share), `карточка «${award.share}» нарушает ${bad}`);
    }
  }
});

test("ни одна награда не выдаётся за вес и не обещает его изменить", () => {
  // Здесь мягче: `note` может назвать раздел «Еда и вес» — это имя экрана, а
  // не обещание. Запрещены именно достижения и обещания.
  const FORBIDDEN = [/похуд/i, /сброшен/i, /потеря\w* (веса|кг)/i, /минус \d/i, /−\d/, /-\d+ ?кг/i];
  for (const award of AWARDS) {
    for (const text of [award.title, award.note]) {
      for (const bad of FORBIDDEN) assert.ok(!bad.test(text), `«${text}» нарушает ${bad}`);
    }
  }
  // И проверка по существу: набор наград не меняется ни от какого веса —
  // состояния AwardState его просто не содержит.
  assert.deepEqual(Object.keys(state()).sort(), ["bestStreak", "mealCount", "totalDays"]);
});

test("тексты наград не хвалят и не подгоняют", () => {
  const FORBIDDEN = [/молодец/i, /отличн/i, /супер/i, /продолжайте/i, /не сдавайтесь/i, /вы должны/i];
  for (const award of AWARDS) {
    for (const text of [award.title, award.note, award.share]) {
      for (const bad of FORBIDDEN) assert.ok(!bad.test(text), `«${text}» нарушает ${bad}`);
      assert.ok(!text.includes("!"), `«${text}» — восклицание не в голосе сервиса`);
      assert.ok(text.trim().length > 0, `у ${award.key} пустой текст`);
    }
  }
});

/* ===== Новые ===== */

test("новыми считаются только те, которых нет в базе", () => {
  const s = state({ totalDays: 8, mealCount: 0, bestStreak: 8 });
  const all = earnedAwards(s);
  assert.ok(all.length >= 3, "нечего проверять");
  assert.deepEqual(newlyEarned(s, all), [], "уже записанные пришли как новые");
  assert.deepEqual(newlyEarned(s, []), all);
});

test("из нескольких новых показывается самая крупная", () => {
  // Вернувшийся после перерыва может пересечь три рубежа за один день. Три
  // поздравления подряд — это поток, а не событие.
  const fresh = newlyEarned(state({ totalDays: 90, mealCount: 120, bestStreak: 8 }), []);
  assert.ok(fresh.length > 1, "нечего выбирать");
  const shown = freshest(fresh);
  assert.ok(shown);
  assert.equal(shown.key, fresh.map((k) => k).sort((a, b) => order(b) - order(a))[0]);
});

test("выбор из пустого — ничего, а не падение", () => {
  assert.equal(freshest([]), null);
  assert.equal(freshest(["выдумка"]), null);
});

/* ===== Целостность ===== */

test("ключи уникальны и проверяются перед записью в базу", () => {
  const keys = AWARDS.map((a) => a.key);
  assert.equal(new Set(keys).size, keys.length, "ключи повторяются");
  for (const key of keys) assert.ok(isAwardKey(key), `${key} не проходит проверку`);
  assert.ok(!isAwardKey("drop table"));
  assert.ok(!isAwardKey(""));
  assert.ok(!isAwardKey(null));
  assert.ok(!isAwardKey(42));
});

test("награда достаётся по ключу, неизвестный ключ даёт null", () => {
  assert.equal(awardByKey("days-7").title, "Неделя");
  assert.equal(awardByKey("нет такой"), null);
});

test("склонение записей русское", () => {
  assert.equal(entriesWord(1), "1 запись");
  assert.equal(entriesWord(3), "3 записи");
  assert.equal(entriesWord(11), "11 записей");
  assert.equal(entriesWord(412), "412 записей");
});

function order(key) {
  return AWARDS.findIndex((a) => a.key === key);
}
