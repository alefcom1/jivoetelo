import test from "node:test";
import assert from "node:assert/strict";
import { computeStreak } from "../lib/streak.ts";
import {
  DEFAULT_DIGEST_HOUR,
  GENTLE_NUDGE_TEXT,
  MAX_DIGEST_HOUR,
  MIN_DIGEST_HOUR,
  normalizeDigestHour,
  photoDigestText,
  planReminder,
  silenceNudge,
  SILENCE_STEPS,
  snoozeUntil,
} from "../lib/reminders.ts";
import { htmlProblem } from "../lib/bot/markup.ts";

const NOW = new Date("2026-07-28T17:05:00Z");

/** Вечер, есть одно неразобранное фото, сегодня бот ещё не писал. */
function context(overrides = {}) {
  return {
    now: NOW,
    localDay: "2026-07-28",
    localHour: 20,
    remindersEnabled: true,
    digestHour: 20,
    snoozedUntil: null,
    lastReminderOn: null,
    pendingPhotosToday: 1,
    mealsToday: 0,
    // Первый вечер без записей: лестница молчания начинается отсюда
    // (lib/reminders.ts). День выбран умолчанием, потому что именно он
    // сохраняет прежнее поведение — лёгкое «как прошёл день».
    silentDays: 1,
    ...overrides,
  };
}

test("вечером с неразобранными фото приходит дайджест", () => {
  const plan = planReminder(context());
  assert.equal(plan?.kind, "photo_digest");
  assert.match(plan.text, /1 фото ждёт разбора/);
});

test("выключенные напоминания молчат при любых условиях", () => {
  assert.equal(planReminder(context({ remindersEnabled: false })), null);
});

test("пауза молчит до своего срока и снова пишет после", () => {
  const until = new Date(NOW.getTime() + 60_000);
  assert.equal(planReminder(context({ snoozedUntil: until })), null);

  const past = new Date(NOW.getTime() - 60_000);
  assert.equal(planReminder(context({ snoozedUntil: past }))?.kind, "photo_digest");
});

test("больше одного сообщения в день не бывает", () => {
  assert.equal(planReminder(context({ lastReminderOn: "2026-07-28" })), null);
  assert.equal(planReminder(context({ lastReminderOn: "2026-07-27" }))?.kind, "photo_digest");
});

test("ночью и ранним утром бот молчит", () => {
  for (const localHour of [0, 3, 6, 8, 22, 23]) {
    assert.equal(planReminder(context({ localHour, digestHour: 9 })), null, `час ${localHour}`);
  }
});

test("до часа дайджеста не пишем, начиная с него — пишем", () => {
  assert.equal(planReminder(context({ localHour: 19, digestHour: 20 })), null);
  assert.equal(planReminder(context({ localHour: 20, digestHour: 20 }))?.kind, "photo_digest");
  assert.equal(planReminder(context({ localHour: 21, digestHour: 20 }))?.kind, "photo_digest");
});

test("час дайджеста за пределами тихих часов не запирает напоминания навсегда", () => {
  // Значение из базы могло приехать любым; нормализация обязана оставить
  // его в окне, где бот вообще имеет право писать.
  const plan = planReminder(context({ localHour: 21, digestHour: 23 }));
  assert.equal(plan?.kind, "photo_digest");
});

test("пустой день без фото получает мягкое напоминание", () => {
  const plan = planReminder(context({ pendingPhotosToday: 0, mealsToday: 0 }));
  assert.equal(plan?.kind, "gentle_nudge");
  assert.equal(plan.text, GENTLE_NUDGE_TEXT);
});

test("в напоминании нет упрёка", () => {
  const texts = [GENTLE_NUDGE_TEXT, photoDigestText(3)];
  for (const text of texts) {
    assert.doesNotMatch(text, /пропустил|забыл|снова|опять|срыв|серия|подряд/i, text);
  }
});

test("записанный день без фото не получает ничего", () => {
  assert.equal(planReminder(context({ pendingPhotosToday: 0, mealsToday: 3 })), null);
});

test("фото важнее мягкого напоминания: показываем то, где есть что делать", () => {
  const plan = planReminder(context({ pendingPhotosToday: 2, mealsToday: 5 }));
  assert.equal(plan?.kind, "photo_digest");
});

test("текст дайджеста согласуется с числом фото", () => {
  assert.match(photoDigestText(1), /1 фото ждёт разбора\./);
  assert.match(photoDigestText(2), /2 фото ждут разбора/);
  assert.match(photoDigestText(5), /5 фото ждут разбора/);
  assert.match(photoDigestText(11), /11 фото ждут разбора/);
});

test("час дайджеста нормализуется в допустимое окно", () => {
  assert.equal(normalizeDigestHour(20), 20);
  assert.equal(normalizeDigestHour(0), MIN_DIGEST_HOUR);
  assert.equal(normalizeDigestHour(23), MAX_DIGEST_HOUR);
  assert.equal(normalizeDigestHour(-5), MIN_DIGEST_HOUR);
  assert.equal(normalizeDigestHour("не число"), DEFAULT_DIGEST_HOUR);
  assert.equal(normalizeDigestHour(null), MIN_DIGEST_HOUR); // Number(null) === 0
  assert.equal(normalizeDigestHour(19.7), 19);
});

test("пауза действительно переносит следующий заход за завтра", () => {
  const until = snoozeUntil(NOW);
  assert.ok(until.getTime() - NOW.getTime() > 48 * 60 * 60 * 1000);
});

/**
 * Живело в напоминании. Проверяется не текст, а граница: персонаж добавляет
 * контекст к сообщению, которое и так отправляется, но никогда не создаёт
 * повода отправить.
 */
test("серия не заставляет бота писать там, где он молчал", () => {
  const base = {
    now: new Date("2026-03-18T18:00:00Z"),
    localDay: "2026-03-18",
    localHour: 21,
    remindersEnabled: true,
    digestHour: 20,
    snoozedUntil: null,
    lastReminderOn: null,
    pendingPhotosToday: 0,
    // День записан и фото разобраны — повода нет.
    mealsToday: 3,
  };
  const streak = computeStreak(["2026-03-15", "2026-03-16"], "2026-03-18");
  assert.equal(planReminder({ ...base, streak }), null, "с серией бот обязан молчать так же, как без неё");
});

test("к найденному поводу дописывается реплика Живело", () => {
  const base = {
    now: new Date("2026-03-18T18:00:00Z"),
    localDay: "2026-03-18",
    localHour: 21,
    remindersEnabled: true,
    digestHour: 20,
    snoozedUntil: null,
    lastReminderOn: null,
    pendingPhotosToday: 0,
    mealsToday: 0,
    silentDays: 1,
  };
  // Серия оборвалась пару дней назад: енот берёт пропуск на себя и называет
  // накопленное. Ушедшему на две недели (mood «asleep») он ничего не говорит —
  // «серия сбилась» тому, кого не было полмесяца, это новость ни о чём.
  const broken = computeStreak(["2026-03-11", "2026-03-12", "2026-03-13"], "2026-03-18");
  const plan = planReminder({ ...base, streak: broken });
  assert.match(plan.text, /🦝/, `реплики нет: ${plan.text}`);
  assert.match(plan.text, /3 дня с записями/);
  assert.ok(!/\bвы\s+пропустил/i.test(plan.text), `упрёк в напоминании: ${plan.text}`);

  // Без серии сообщение остаётся ровно прежним.
  assert.equal(planReminder(base).text, GENTLE_NUDGE_TEXT);

  // А вернувшемуся через две недели — только обычный текст, без реплики.
  const longGone = computeStreak(["2026-03-01", "2026-03-02"], "2026-03-18");
  assert.equal(planReminder({ ...base, streak: longGone }).text, GENTLE_NUDGE_TEXT);
});

/**
 * Лестница молчания.
 *
 * До неё пустой день получал одну и ту же строку каждый вечер — бесконечно.
 * Проверяется здесь не «сообщение отправилось», а два свойства, ради которых
 * лестница и написана: в промежуточные вечера бот молчит, и после
 * четырнадцатого дня он молчит навсегда.
 */

test("бот пишет только на своих ступенях, а между ними молчит", () => {
  const speaks = [];
  for (let day = 1; day <= 40; day += 1) {
    if (silenceNudge(day, 20)) speaks.push(day);
  }
  assert.deepEqual(speaks, [...SILENCE_STEPS], "лишний вечер — это шаг к кнопке «заблокировать»");
});

test("после прощания бот молчит навсегда", () => {
  for (const day of [15, 21, 60, 365, 1000]) {
    assert.equal(silenceNudge(day, 100), null, `${day}-й день тишины`);
  }
});

test("первый вечер остаётся лёгким", () => {
  // Один пропущенный день — это обычная жизнь, а не повод для драмы.
  const plan = silenceNudge(1, 30);
  assert.equal(plan.kind, "gentle_nudge");
  assert.equal(plan.text, GENTLE_NUDGE_TEXT);
});

test("тоска — по человеку, а не оценка его еды", () => {
  // Главное правило всей лестницы. Дневник питания читают люди, у которых с
  // едой непростые отношения: «вы ничего не записали» такой человек прочтёт
  // как «ты опять сорвался», если рядом окажется хоть одно слово о питании.
  //
  // Проверка на оценочные обороты, а не на отдельные слова: прощание обещает,
  // что «замеры веса останутся на месте», и это разговор про сохранность
  // данных, а не про килограммы. Запрет на слово «вес» такую фразу тоже бы
  // поймал — и тогда следующий человек просто вычеркнул бы слово из теста.
  for (const day of SILENCE_STEPS) {
    const { text } = silenceNudge(day, 12);
    assert.doesNotMatch(text, /сорв|переел|недоел|набрали|похуде|калори|диет|стыд|ленив/i, text);
    assert.doesNotMatch(text, /вы не смогли|вы опять|снова не|как всегда|надо было|вы обещали/i, text);
  }
});

test("право забросить признаётся вслух, а возврат всегда назван", () => {
  const week = silenceNudge(7, 12);
  assert.match(week.text, /ваше право/i, "без этого получается не грусть, а претензия");
  assert.match(week.text, /фото/i, "у каждого сообщения должен быть выход в одно действие");

  const farewell = silenceNudge(14, 12);
  assert.match(farewell.text, /последнее/i, "прощание обязано назвать себя прощанием");
  assert.match(farewell.text, /останутся на месте|никуда/i, "человек боится потерять записи");
});

test("тому, кто не записал ни разу, не обещают сохранённых записей", () => {
  // «Ваши дни с записями ждут» человеку без единой записи — обещание,
  // рассыпающееся на первой же фразе.
  const empty = silenceNudge(7, 0);
  assert.doesNotMatch(empty.text, /дней с записями|дня с записями|день с записями/);
  assert.match(silenceNudge(7, 12).text, /12 дней с записями/);
});

test("картинка идёт ровно с одним сообщением", () => {
  // Повторённая на каждом шаге, она превращается из жеста в приём.
  const withCard = SILENCE_STEPS.filter((day) => silenceNudge(day, 5).kind === "silence_week");
  assert.deepEqual(withCard, [7]);
});

test("разметка всех сообщений лестницы корректна", () => {
  for (const day of SILENCE_STEPS) {
    assert.equal(htmlProblem(silenceNudge(day, 3).text), null, `день ${day}`);
  }
});
