import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveGoal } from "../lib/onboarding.ts";
import { evaluateQuiz } from "../lib/quiz.ts";
import { SOFTENING_NOTES, softeningReason } from "../lib/safety.ts";

/**
 * Здесь проверяется не функция, а согласие двух частей продукта.
 *
 * Дефект, ради которого написан этот файл, выглядел так: квиз на сайте
 * отговаривал от дефицита по шести признакам, а онбординг смягчал цель по
 * двум. Человек, которому витрина сказала «сейчас не время», заходил в
 * дневник обычным путём и спокойно получал дефицит. Ошибка была не в
 * значении какой-то константы, а в том, что правил было два.
 */

const RELATIONSHIP = ["calm", "tense", "hard"];
const SLEEP = ["ok", "poor"];
const LIFE_LOAD = ["calm", "busy", "overloaded"];
const DIETING = ["no", "recently", "constantly"];
const MOTIVATION = ["health", "look", "energy", "unsure"];

/** Все 216 сочетаний ответов квиза. */
function everyAnswerSet() {
  const out = [];
  for (const relationship of RELATIONSHIP) {
    for (const sleep of SLEEP) {
      for (const lifeLoad of LIFE_LOAD) {
        for (const recentDieting of DIETING) {
          for (const motivation of MOTIVATION) {
            out.push({ relationship, sleep, lifeLoad, recentDieting, motivation });
          }
        }
      }
    }
  }
  return out;
}

test("вердикт квиза «не сейчас» всегда смягчает цель в онбординге", () => {
  // Главная проверка файла. Перебираем все сочетания, а не выборочные:
  // расхождение и было в редких углах, куда выборка не заглядывала.
  for (const answers of everyAnswerSet()) {
    const verdict = evaluateQuiz(answers);
    const goal = effectiveGoal({ goal: "lose", birthYear: 1990, ...answers }, 2026);

    if (verdict.key === "reduce") {
      assert.equal(goal, "lose", `квиз разрешил, а онбординг смягчил: ${JSON.stringify(answers)}`);
    } else {
      assert.equal(goal, "maintain", `квиз отговорил, а онбординг оставил дефицит: ${JSON.stringify(answers)}`);
    }
  }
});

test("на каждый набор ответов у квиза и у правила один и тот же ответ", () => {
  const EXPECTED = {
    hard_relationship: "care",
    overload: "steady",
    dieting_cycle: "maintain",
  };
  for (const answers of everyAnswerSet()) {
    const reason = softeningReason(answers);
    const expected = reason ? EXPECTED[reason] : "reduce";
    assert.equal(evaluateQuiz(answers).key, expected, JSON.stringify(answers));
  }
});

test("несовершеннолетие смягчает цель независимо от остальных ответов", () => {
  // Возраст стоит выше всех признаков: тело ещё растёт, и это не тот случай,
  // где спокойные ответы на другие вопросы что-то меняют.
  for (const answers of everyAnswerSet()) {
    const goal = effectiveGoal({ goal: "lose", birthYear: 2012, ...answers }, 2026);
    assert.equal(goal, "maintain", `подросток получил дефицит: ${JSON.stringify(answers)}`);
  }
  assert.equal(softeningReason({ minor: true, relationship: "calm" }), "minor");
});

test("пустые признаки — это «не знаем», а не «всё хорошо»", () => {
  // Онбординг не спрашивает про сон и диеты. Отсутствие ответа не должно ни
  // смягчать цель на пустом месте, ни считаться подтверждением, что всё в
  // порядке: смягчение включают только явные ответы.
  assert.equal(softeningReason({}), null);
  assert.equal(softeningReason({ relationship: "calm" }), null);
  // «Недавно сидел на диете» без указанной мотивации — ещё не повод: правило
  // требует именно немедицинской мотивации, а не её отсутствия.
  assert.equal(softeningReason({ recentDieting: "recently" }), null);
  assert.equal(softeningReason({ recentDieting: "recently", motivation: "look" }), "dieting_cycle");
  assert.equal(softeningReason({ recentDieting: "recently", motivation: "health" }), null);
});

test("приоритет причин: отношения с едой выше перегрузки", () => {
  // Недосып проходит, а расстройство пищевого поведения от подсчёта калорий
  // усугубляется — поэтому при обоих признаках сработать должно второе.
  assert.equal(
    softeningReason({ relationship: "hard", sleep: "poor", lifeLoad: "overloaded" }),
    "hard_relationship",
  );
  assert.equal(softeningReason({ sleep: "poor", recentDieting: "constantly" }), "overload");
});

test("у каждой причины есть объяснение человеку", () => {
  for (const reason of ["minor", "hard_relationship", "overload", "dieting_cycle"]) {
    assert.ok(SOFTENING_NOTES[reason]?.length > 40, `${reason}: объяснения нет или оно слишком короткое`);
    // Отрицание не считается обвинением: «это физиология, а не слабая воля»
    // как раз снимает вину, и первая версия этой проверки ошибочно ловила
    // именно её. Ищем утверждение, а не упоминание.
    assert.doesNotMatch(
      SOFTENING_NOTES[reason],
      /(?<!не )слаб(ая|ость) вол|нельзя|запрещ|вы должны|вы обязаны/i,
      `${reason}: формулировка стыдит, а не объясняет`,
    );
  }
});
