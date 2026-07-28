import test from "node:test";
import assert from "node:assert/strict";
import { validateSuggestions } from "../lib/ai/suggest.ts";
import { MealAnalysisError } from "../lib/ai/types.ts";

test("валидные варианты проходят, лишние отбрасываются до трёх", () => {
  const s = { title: "Творог с ягодами", why: "Быстро и много белка.", approxKcal: 250, approxProtein: 28, timeMinutes: 3 };
  const result = validateSuggestions({ suggestions: [s, s, s, s, s] });
  assert.equal(result.length, 3);
  assert.equal(result[0].title, "Творог с ягодами");
});

test("значения зажимаются, мусор отбрасывается", () => {
  const result = validateSuggestions({
    suggestions: [
      { title: "Суп", why: "Тёплый вариант.", approxKcal: 99999, approxProtein: -5, timeMinutes: "долго" },
      { title: "", why: "без названия" },
      null,
    ],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].approxKcal, 2000);
  assert.equal(result[0].approxProtein, 0);
  assert.equal(result[0].timeMinutes, 0);
});

test("пустой список — ошибка invalid_output", () => {
  assert.throws(
    () => validateSuggestions({ suggestions: [] }),
    (error) => error instanceof MealAnalysisError && error.reason === "invalid_output",
  );
});
