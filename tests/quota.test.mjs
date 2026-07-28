import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateCostUsd,
  normalizePlan,
  OPERATION_LABELS,
  PLAN_LIMITS,
  quotaMessage,
} from "../lib/quota-policy.ts";

test("бесплатный тариф покрывает реальный день с большим запасом", () => {
  const free = PLAN_LIMITS.free;
  // Реальный сценарий: 3–5 приёмов пищи + пара советов в день.
  assert.ok(free.analyze_photo >= 15, `фото: ${free.analyze_photo}`);
  assert.ok(free.analyze_text >= 30, `текст: ${free.analyze_text}`);
  assert.ok(free.suggest >= 10, `советы: ${free.suggest}`);
});

test("тариф premium существует как задел и не уже бесплатного", () => {
  for (const key of Object.keys(PLAN_LIMITS.free)) {
    assert.ok(
      PLAN_LIMITS.premium[key] >= PLAN_LIMITS.free[key],
      `premium.${key} не должен быть меньше free`,
    );
  }
});

test("normalizePlan защищает от мусора в базе", () => {
  assert.equal(normalizePlan("premium"), "premium");
  assert.equal(normalizePlan("free"), "free");
  assert.equal(normalizePlan(null), "free");
  assert.equal(normalizePlan("enterprise-ultra"), "free");
});

test("оценка стоимости считается по ценам модели", () => {
  // 1M входных = $5, 1M выходных = $25
  assert.equal(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 0 }), 5);
  assert.equal(estimateCostUsd({ inputTokens: 0, outputTokens: 1_000_000 }), 25);
  const meal = estimateCostUsd({ inputTokens: 1800, outputTokens: 380 });
  assert.ok(meal > 0 && meal < 0.05, `разбор фото должен стоить копейки, вышло ${meal}`);
});

test("сообщения об отказе поддерживающие и без обвинений", () => {
  const messages = [
    quotaMessage({ allowed: false, reason: "too_fast" }),
    quotaMessage({ allowed: false, reason: "daily_limit", used: 20, limit: 20, operation: "analyze_photo" }),
    quotaMessage({ allowed: false, reason: "service_budget" }),
  ];
  for (const message of messages) {
    assert.ok(message.length > 20, "сообщение должно объяснять ситуацию");
    for (const forbidden of ["злоупотреб", "слишком много", "нельзя", "запрещ", "превысили", "исчерпали лимит доверия"]) {
      assert.ok(!message.toLowerCase().includes(forbidden), `нашли «${forbidden}» в: ${message}`);
    }
  }
});

test("сообщение о дневном лимите называет число и подсказывает выход", () => {
  const message = quotaMessage({
    allowed: false, reason: "daily_limit", used: 20, limit: 20, operation: "analyze_photo",
  });
  assert.match(message, /20/);
  assert.match(message, /вручную/, "должен остаться бесплатный путь без AI");
  assert.match(message, new RegExp(OPERATION_LABELS.analyze_photo));
});
