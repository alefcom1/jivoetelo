import test from "node:test";
import assert from "node:assert/strict";
import { resolveModel } from "../lib/ai/client.ts";

/**
 * Модель под задачу, а не одна на всё (docs/ai-proxy.md): фото — дороже
 * (claude-sonnet-5, зрение экономить нельзя), текст и подсказки — дешевле
 * (claude-haiku-4-5, задача простая). Старый ANTHROPIC_MODEL должен
 * перекрывать все три операции разом — это обратная совместимость с тем,
 * что уже настроено в проде.
 */

const KEYS = ["ANTHROPIC_MODEL", "ANTHROPIC_MODEL_VISION", "ANTHROPIC_MODEL_TEXT", "ANTHROPIC_MODEL_SUGGEST"];

function withEnv(values, run) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  try {
    return run();
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("без переменных окружения — разумные умолчания по операции", () => {
  withEnv({}, () => {
    assert.equal(resolveModel("analyze_photo"), "claude-sonnet-5");
    assert.equal(resolveModel("analyze_text"), "claude-haiku-4-5");
    assert.equal(resolveModel("suggest"), "claude-haiku-4-5");
  });
});

test("разбор фото не экономит на модели — зрение остаётся на sonnet, а не haiku", () => {
  withEnv({}, () => {
    assert.notEqual(resolveModel("analyze_photo"), resolveModel("analyze_text"));
    assert.equal(resolveModel("analyze_photo"), "claude-sonnet-5");
  });
});

test("переменная под операцию переопределяет умолчание только для неё", () => {
  withEnv({ ANTHROPIC_MODEL_VISION: "claude-opus-5" }, () => {
    assert.equal(resolveModel("analyze_photo"), "claude-opus-5");
    // Текст и подсказки не задеты — у них своя переменная.
    assert.equal(resolveModel("analyze_text"), "claude-haiku-4-5");
    assert.equal(resolveModel("suggest"), "claude-haiku-4-5");
  });
});

test("каждая операция слушает свою переменную независимо от других", () => {
  withEnv(
    {
      ANTHROPIC_MODEL_VISION: "custom-vision-model",
      ANTHROPIC_MODEL_TEXT: "custom-text-model",
      ANTHROPIC_MODEL_SUGGEST: "custom-suggest-model",
    },
    () => {
      assert.equal(resolveModel("analyze_photo"), "custom-vision-model");
      assert.equal(resolveModel("analyze_text"), "custom-text-model");
      assert.equal(resolveModel("suggest"), "custom-suggest-model");
    },
  );
});

test("старый ANTHROPIC_MODEL — обратная совместимость: перекрывает все три операции разом", () => {
  withEnv({ ANTHROPIC_MODEL: "claude-opus-5" }, () => {
    assert.equal(resolveModel("analyze_photo"), "claude-opus-5");
    assert.equal(resolveModel("analyze_text"), "claude-opus-5");
    assert.equal(resolveModel("suggest"), "claude-opus-5");
  });
});

test("ANTHROPIC_MODEL старше переменных под операцию — так работало и раньше", () => {
  withEnv({ ANTHROPIC_MODEL: "claude-opus-5", ANTHROPIC_MODEL_VISION: "claude-sonnet-5" }, () => {
    // Кто уже настроил ANTHROPIC_MODEL в проде, не должен ничего сломать,
    // добавив новые переменные с умолчаниями в код.
    assert.equal(resolveModel("analyze_photo"), "claude-opus-5");
  });
});

test("пустая строка в переменной — как будто её нет", () => {
  withEnv({ ANTHROPIC_MODEL: "", ANTHROPIC_MODEL_VISION: "   " }, () => {
    assert.equal(resolveModel("analyze_photo"), "claude-sonnet-5");
    assert.equal(resolveModel("analyze_text"), "claude-haiku-4-5");
  });
});
