import test from "node:test";
import assert from "node:assert/strict";
import { resolveAiMode } from "../lib/ai/mode.ts";

/**
 * Правило одно и стоит оно дорого: в бою сервис не показывает выдуманный
 * разбор. Mock отвечает «сырники со сметаной» на что угодно — сфотографируй
 * салат, получишь сырники, — и в интерфейсе это неотличимо от настоящего
 * ответа. Поэтому тесты здесь не про переменные окружения, а про то, чтобы
 * ни одна их комбинация не привела к выдуманным цифрам у живого человека.
 */

const KEYS = ["AI_PROVIDER", "NODE_ENV", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"];

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

const CREDENTIALS = { ANTHROPIC_BASE_URL: "https://proxy.example/api", ANTHROPIC_AUTH_TOKEN: "x".repeat(64) };

test("в продакшене mock не подделывает разбор, а выключает его", () => {
  withEnv({ AI_PROVIDER: "mock", NODE_ENV: "production" }, () => {
    assert.equal(resolveAiMode(), "off");
  });
});

test("в разработке mock остаётся mock — иначе не пройти поток добавления еды", () => {
  withEnv({ AI_PROVIDER: "mock", NODE_ENV: "development" }, () => {
    assert.equal(resolveAiMode(), "mock");
  });
});

test("живая демонстрация в бою включается только явным demo", () => {
  withEnv({ AI_PROVIDER: "demo", NODE_ENV: "production" }, () => {
    assert.equal(resolveAiMode(), "mock");
  });
});

test("off выключает разбор в любом окружении и при любых ключах", () => {
  for (const env of ["production", "development"]) {
    withEnv({ AI_PROVIDER: "off", NODE_ENV: env, ...CREDENTIALS }, () => {
      assert.equal(resolveAiMode(), "off", env);
    });
  }
});

test("без учётных данных в бою — отказ, а не выдуманные цифры", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    assert.equal(resolveAiMode(), "off");
  });
});

test("без учётных данных в разработке — mock, чтобы можно было работать без ключей", () => {
  withEnv({ NODE_ENV: "development" }, () => {
    assert.equal(resolveAiMode(), "mock");
  });
});

test("с учётными данными и без AI_PROVIDER — настоящий провайдер", () => {
  withEnv({ NODE_ENV: "production", ...CREDENTIALS }, () => {
    assert.equal(resolveAiMode(), "anthropic");
  });
  withEnv({ NODE_ENV: "production", ANTHROPIC_API_KEY: "sk-ant-test" }, () => {
    assert.equal(resolveAiMode(), "anthropic");
  });
});

test("пустой AI_PROVIDER не считается режимом", () => {
  withEnv({ AI_PROVIDER: "   ", NODE_ENV: "production", ...CREDENTIALS }, () => {
    assert.equal(resolveAiMode(), "anthropic");
  });
});

test("ни одна комбинация в продакшене не даёт mock без явного demo", () => {
  const values = [undefined, "", "mock", "off", "anthropic", "MOCK", "нечто"];
  for (const provider of values) {
    for (const creds of [{}, CREDENTIALS]) {
      const env = { NODE_ENV: "production", ...creds };
      if (provider !== undefined) env.AI_PROVIDER = provider;
      withEnv(env, () => {
        assert.notEqual(resolveAiMode(), "mock", `AI_PROVIDER=${JSON.stringify(provider)} ключи=${!!creds.ANTHROPIC_BASE_URL}`);
      });
    }
  }
});

/**
 * Дальше — не про режим, а про то, что из него следует. Проверяем цепочку
 * целиком: провайдер → ошибка с причиной → текст, который увидит человек.
 * Модули с провайдерами импортируются лениво, потому что `getMealProvider`
 * кэширует выбор при первом вызове.
 */

test("выключенный разбор бросает ошибку с причиной disabled, а не выдумывает еду", async () => {
  const { DisabledMealProvider, DisabledSuggestionProvider } = await import("../lib/ai/disabled.ts");
  const { MealAnalysisError } = await import("../lib/ai/types.ts");

  await assert.rejects(
    () => new DisabledMealProvider().analyseMeal({ kind: "text", text: "борщ" }),
    (error) => error instanceof MealAnalysisError && error.reason === "disabled",
  );
  await assert.rejects(
    () => new DisabledSuggestionProvider().suggest(),
    (error) => error instanceof MealAnalysisError && error.reason === "disabled",
  );
});

test("у каждой причины отказа есть текст, и disabled не зовёт «попробовать через минуту»", async () => {
  const { ANALYSIS_ERRORS, SUGGEST_ERRORS } = await import("../lib/ai/types.ts");

  for (const reason of ["refused", "invalid_output", "provider_error", "disabled"]) {
    assert.ok(ANALYSIS_ERRORS[reason]?.length > 10, `нет текста для ${reason}`);
  }
  // Повторять нечего: разбор выключен, и через минуту он не включится.
  assert.doesNotMatch(ANALYSIS_ERRORS.disabled, /через минуту|попробуйте ещё раз/i);
  assert.match(ANALYSIS_ERRORS.disabled, /вручную/i);
  assert.doesNotMatch(SUGGEST_ERRORS.disabled, /через минуту/i);
});

test("mock отвечает одним и тем же на что угодно — ради этого и городился off", async () => {
  const { MockMealProvider } = await import("../lib/ai/mock.ts");
  const provider = new MockMealProvider();
  const salad = await provider.analyseMeal({ kind: "text", text: "салат из огурцов" });
  const soup = await provider.analyseMeal({ kind: "text", text: "борщ со сметаной" });
  assert.deepEqual(
    salad.analysis.items.map((i) => i.name),
    soup.analysis.items.map((i) => i.name),
    "если mock начнёт различать еду, этот тест можно пересмотреть",
  );
});
