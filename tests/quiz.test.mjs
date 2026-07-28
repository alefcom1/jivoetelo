import test from "node:test";
import assert from "node:assert/strict";
import { evaluateQuiz } from "../lib/quiz.ts";

const MOTIVATIONS = ["health", "look", "energy", "unsure"];
const RECENT_DIETINGS = ["no", "recently", "constantly"];
const RELATIONSHIPS = ["calm", "tense", "hard"];
const SLEEPS = ["ok", "poor"];
const LIFE_LOADS = ["calm", "busy", "overloaded"];

const FORBIDDEN_SUBSTRINGS = ["вредн", "лишний вес", "сожг", "отработать", "нельзя есть"];

function allAnswers() {
  const combos = [];
  for (const motivation of MOTIVATIONS) {
    for (const recentDieting of RECENT_DIETINGS) {
      for (const relationship of RELATIONSHIPS) {
        for (const sleep of SLEEPS) {
          for (const lifeLoad of LIFE_LOADS) {
            combos.push({ motivation, recentDieting, relationship, sleep, lifeLoad });
          }
        }
      }
    }
  }
  return combos;
}

const BASE_ANSWERS = {
  motivation: "health",
  recentDieting: "no",
  relationship: "calm",
  sleep: "ok",
  lifeLoad: "calm",
};

test("вердикт reduce достижим при отсутствии отягчающих ответов", () => {
  const verdict = evaluateQuiz(BASE_ANSWERS);
  assert.equal(verdict.key, "reduce");
});

test("вердикт maintain достижим при постоянных диетах", () => {
  const verdict = evaluateQuiz({ ...BASE_ANSWERS, recentDieting: "constantly" });
  assert.equal(verdict.key, "maintain");
});

test("вердикт maintain достижим при недавней диете и мотивации не про здоровье", () => {
  const verdict = evaluateQuiz({ ...BASE_ANSWERS, recentDieting: "recently", motivation: "look" });
  assert.equal(verdict.key, "maintain");
});

test("вердикт steady достижим при перегрузке в жизни", () => {
  const verdict = evaluateQuiz({ ...BASE_ANSWERS, lifeLoad: "overloaded" });
  assert.equal(verdict.key, "steady");
});

test("вердикт steady достижим при плохом сне, даже если всё остальное в порядке", () => {
  const verdict = evaluateQuiz({ ...BASE_ANSWERS, sleep: "poor" });
  assert.equal(verdict.key, "steady");
});

test("вердикт care достижим при тяжёлых отношениях с едой", () => {
  const verdict = evaluateQuiz({ ...BASE_ANSWERS, relationship: "hard" });
  assert.equal(verdict.key, "care");
});

test("вердикт care достижим при напряжённых отношениях с едой и постоянных диетах", () => {
  const verdict = evaluateQuiz({ ...BASE_ANSWERS, relationship: "tense", recentDieting: "constantly" });
  assert.equal(verdict.key, "care");
});

test("care имеет приоритет над всем остальным: тяжёлые отношения с едой перевешивают ответы, располагающие к снижению", () => {
  const verdict = evaluateQuiz({
    motivation: "health",
    recentDieting: "no",
    relationship: "hard",
    sleep: "ok",
    lifeLoad: "calm",
  });
  assert.equal(verdict.key, "care");
});

test("care имеет приоритет над steady и maintain одновременно", () => {
  const verdict = evaluateQuiz({
    motivation: "look",
    recentDieting: "constantly",
    relationship: "hard",
    sleep: "poor",
    lifeLoad: "overloaded",
  });
  assert.equal(verdict.key, "care");
});

test("каждый вердикт содержит непустые title, summary и минимум два пункта advice", () => {
  const seenKeys = new Set();
  for (const answers of allAnswers()) {
    const verdict = evaluateQuiz(answers);
    seenKeys.add(verdict.key);

    assert.ok(verdict.title.length > 0, `title пуст для ${JSON.stringify(answers)}`);
    assert.ok(verdict.summary.length > 0, `summary пуст для ${JSON.stringify(answers)}`);
    assert.ok(
      Array.isArray(verdict.advice) && verdict.advice.length >= 2,
      `advice должен содержать минимум два пункта для ${JSON.stringify(answers)}`
    );
    for (const item of verdict.advice) {
      assert.ok(item.length > 0, `пункт advice пуст для ${JSON.stringify(answers)}`);
    }
  }

  assert.deepEqual(
    [...seenKeys].sort(),
    ["care", "maintain", "reduce", "steady"],
    "все четыре вердикта должны быть достижимы хотя бы одной комбинацией ответов"
  );
});

test("ни один текст вердикта не содержит запрещённых слов", () => {
  for (const answers of allAnswers()) {
    const verdict = evaluateQuiz(answers);
    const texts = [verdict.title, verdict.summary, ...verdict.advice];
    for (const text of texts) {
      const lower = text.toLowerCase();
      for (const forbidden of FORBIDDEN_SUBSTRINGS) {
        assert.ok(
          !lower.includes(forbidden),
          `текст «${text}» содержит запрещённую подстроку «${forbidden}» (ответы: ${JSON.stringify(answers)})`
        );
      }
    }
  }
});
