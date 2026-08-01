import test from "node:test";
import assert from "node:assert/strict";
import { resolveModel, supportsEffort } from "../lib/ai/client.ts";

/**
 * Модель под задачу, а не одна на всё (docs/ai-proxy.md): фото — дороже
 * (claude-sonnet-5, зрение экономить нельзя), текст и подсказки — дешевле,
 * задача простая. Старый ANTHROPIC_MODEL должен перекрывать все три операции
 * разом — это обратная совместимость с тем, что уже настроено в проде.
 *
 * ## Чего эти проверки не ловят
 *
 * Здесь стояло `claude-haiku-4-5`, и тест исправно проходил — при том что
 * API такого идентификатора не знает. Подсказки и разбор текста падали в
 * проде с ошибкой провайдера, а пользователь видел «попробуйте через минуту».
 *
 * Сверка константы с той же константой доказывает только, что её не
 * переименовали. Правильность идентификатора offline не проверяется вовсе —
 * её подтверждает единственно живой вызов. Поэтому ниже добавлена проверка
 * формы: датированный хвост у моделей, где он обязателен.
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
    assert.equal(resolveModel("analyze_text"), "claude-haiku-4-5-20251001");
    assert.equal(resolveModel("suggest"), "claude-haiku-4-5-20251001");
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
    assert.equal(resolveModel("analyze_text"), "claude-haiku-4-5-20251001");
    assert.equal(resolveModel("suggest"), "claude-haiku-4-5-20251001");
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
    assert.equal(resolveModel("analyze_text"), "claude-haiku-4-5-20251001");
  });
});

test("идентификаторы моделей — те, что принимает API, а не читаемые имена", () => {
  // Именно этого не хватило, чтобы поймать неработающие подсказки. Проверка
  // грубая и неполная: она не подтверждает, что модель существует, — это
  // выясняется только живым вызовом. Но форму «haiku без даты» она ловит.
  withEnv({}, () => {
    for (const op of ["analyze_photo", "analyze_text", "suggest"]) {
      const model = resolveModel(op);
      assert.match(model, /^claude-/, `${op}: ${model}`);
      if (model.includes("haiku")) {
        assert.match(model, /-\d{8}$/, `${op}: у haiku идентификатор датированный, а получили ${model}`);
      }
    }
  });
});

test("effort уходит только тем моделям, которые его понимают", () => {
  // Haiku отвечает на effort «400 This model does not support the effort
  // parameter» и не выполняет запрос вовсе. Мы слали его всем одинаково, и
  // из-за этого молчали подсказки и разбор текста.
  assert.ok(supportsEffort("claude-opus-5"));
  assert.ok(supportsEffort("claude-sonnet-5"));
  assert.ok(supportsEffort("claude-fable-5"));
  assert.ok(!supportsEffort("claude-haiku-4-5-20251001"));
  // Незнакомой модели не отправляем: потерять качество ответа не так больно,
  // как получить 400 и не получить ответа вовсе.
  assert.ok(!supportsEffort("claude-next-9"));
  assert.ok(!supportsEffort(""));
});

test("умолчания моделей не получают effort по ошибке", () => {
  // Сверяем не константы между собой, а умолчание с возможностью модели:
  // именно расхождение этих двух вещей и уронило две операции из трёх.
  withEnv({}, () => {
    for (const operation of ["analyze_photo", "analyze_text", "suggest"]) {
      const model = resolveModel(operation);
      // Утверждение простое: если модель effort не понимает, мы его и не
      // шлём. Проверяется связка «умолчание ↔ возможность», а не константа
      // сама с собой — расхождение именно этих двух вещей уронило две
      // операции из трёх.
      assert.equal(typeof supportsEffort(model), "boolean", operation);
    }
    assert.ok(!supportsEffort(resolveModel("analyze_text")), "разбор текста идёт на haiku — effort ему нельзя");
    assert.ok(!supportsEffort(resolveModel("suggest")), "подсказки идут на haiku — effort ему нельзя");
    assert.ok(supportsEffort(resolveModel("analyze_photo")), "фото идёт на sonnet-5 — effort ему можно");
  });
});
