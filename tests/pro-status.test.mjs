import assert from "node:assert/strict";
import { test } from "node:test";
import { clientStatus, STEADY_DAYS } from "../lib/pro/status.ts";

const TODAY = "2026-07-31";

test("метка никогда не приходит без основания", () => {
  // Голый ярлык — утверждение о человеке, показанное третьему лицу. Основание
  // и есть то, что отличает наш вариант от чужих «Стабильный ритм» ни из чего.
  const cases = [
    { loggedDays: 7, lastMealOn: TODAY, today: TODAY },
    { loggedDays: 3, lastMealOn: "2026-07-29", today: TODAY },
    { loggedDays: 0, lastMealOn: "2026-07-10", today: TODAY },
    { loggedDays: 0, lastMealOn: null, today: TODAY },
  ];
  for (const input of cases) {
    const status = clientStatus(input);
    assert.ok(status.label.length > 0, JSON.stringify(input));
    assert.ok(status.basis.length > 0, `основание пустое: ${JSON.stringify(input)}`);
  }
});

test("стабильный ритм — от пяти дней из семи", () => {
  assert.equal(clientStatus({ loggedDays: STEADY_DAYS, lastMealOn: TODAY, today: TODAY }).kind, "steady");
  assert.equal(clientStatus({ loggedDays: STEADY_DAYS - 1, lastMealOn: TODAY, today: TODAY }).kind, "attention");
});

test("основание совпадает с числом дней", () => {
  assert.equal(clientStatus({ loggedDays: 6, lastMealOn: TODAY, today: TODAY }).basis, "6 из 7 дней");
  assert.equal(clientStatus({ loggedDays: 2, lastMealOn: "2026-07-30", today: TODAY }).basis, "2 из 7 дней");
});

test("без записей за неделю основание — давность, а не «0 из 7»", () => {
  // Иначе пропавший вчера и пропавший месяц назад выглядели бы одинаково,
  // а специалисту важно именно это различие.
  const recent = clientStatus({ loggedDays: 0, lastMealOn: "2026-07-24", today: TODAY });
  const old = clientStatus({ loggedDays: 0, lastMealOn: "2026-06-20", today: TODAY });
  assert.equal(recent.basis, "нет записей 7 дн.");
  assert.equal(old.basis, "нет записей 41 дн.");
  assert.notEqual(recent.basis, old.basis);
});

test("тот, кто ещё не начал, — не «нужна поддержка»", () => {
  // Человек мог принять приглашение час назад. Упрекать его не в чем, и
  // цветом тревоги подсвечивать тоже.
  const status = clientStatus({ loggedDays: 0, lastMealOn: null, today: TODAY });
  assert.equal(status.kind, "idle");
  assert.equal(status.label, "Ещё не начал");
});

test("в метке нет оценки самого человека", () => {
  // Оцениваем регулярность записей. Слова про волю, дисциплину и срывы —
  // ровно тот язык, от которого продукт отказывается.
  const forbidden = /(воля|дисциплин|срыв|лен|молодец|отличн|плох|провал|стыд)/i;
  for (const loggedDays of [0, 1, 3, 5, 7]) {
    const status = clientStatus({ loggedDays, lastMealOn: "2026-07-30", today: TODAY });
    assert.doesNotMatch(`${status.label} ${status.basis}`, forbidden, `loggedDays=${loggedDays}`);
  }
});
