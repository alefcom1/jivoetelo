import assert from "node:assert/strict";
import http from "node:http";
import sharp from "sharp";
import { after, before, test } from "node:test";
import { AnthropicMealProvider } from "../lib/ai/anthropic.ts";
import { AnthropicSuggestionProvider } from "../lib/ai/suggest.ts";

/**
 * Запрос к модели целиком — до сокета и обратно, но без сети и без ключей.
 *
 * ## Зачем понадобилось
 *
 * Разбор фото перестал работать из-за одной строки: общий предел ожидания в
 * сорок секунд обрубал модель со зрением посередине. Починка — свой предел
 * на каждую операцию, и передаётся он вторым аргументом `create`, которого
 * там раньше не было. Проверка типов такое пропустит: аргумент правильный по
 * форме, а вот доедет ли запрос — вопрос к SDK, а не к типам.
 *
 * Поэтому здесь поднимается поддельный Anthropic. Он отвечает тем, что от
 * него ждут, и заодно запоминает, что именно пришло: модель, наличие
 * `effort`, схему ответа. Это те самые вещи, на которых мы уже спотыкались.
 */

let server;
let received;
/** Настоящий JPEG, а не подделка: иначе сжатие перед отправкой не проверяется
 *  и в вывод теста сыплется его запасной путь. */
let jpeg;

before(async () => {
  server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      received = { path: request.url, body: JSON.parse(body || "{}") };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: received.body.model,
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
        content: [{ type: "text", text: JSON.stringify(ANSWERS[received.path] ?? {}) }],
      }));
    });
  });
  jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 120, b: 60 } } })
    .jpeg()
    .toBuffer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.ANTHROPIC_AUTH_TOKEN = "test-token";
});

after(() => {
  server.close();
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
});

// Ответы поддельного сервера подобраны так, чтобы пройти проверку разбора:
// нас интересует, что запрос уходит и ответ разбирается, а не содержимое.
const ANSWERS = {
  "/v1/messages?beta=true": {
    mealType: "lunch",
    items: [{
      name: "Гречка",
      estimatedGrams: 200,
      confidence: "high",
      per100g: { kcal: 110, protein: 4.2, fat: 1.1, carbs: 21.3, fiber: 3.7 },
    }],
    clarifications: [],
    suggestions: [{
      title: "Творог с ягодами",
      why: "Быстро и много белка.",
      approxKcal: 250,
      approxProtein: 28,
      timeMinutes: 3,
    }],
  },
};

test("разбор фото доходит до модели и возвращается разобранным", async () => {
  // Ровно тот путь, который сломался: снимок, модель со зрением, свой предел.
  const provider = new AnthropicMealProvider();
  const result = await provider.analyseMeal({
    kind: "photo",
    data: jpeg,
    mediaType: "image/jpeg",
  });

  assert.equal(result.analysis.items[0].name, "Гречка");
  assert.equal(result.usage.inputTokens, 100);

  // Зрение идёт на sonnet — на нём и держится качество разбора.
  assert.match(received.body.model, /sonnet/);
  assert.equal(received.body.output_config.format.type, "json_schema");

  // Раздумий не просим. Именно они ломали разбор фото: `effort: "medium"`
  // при потолке в 16000 токенов — это «размышляй, бюджет почти не
  // ограничен», и модель размышляла дольше двух минут. Узнавание еды — это
  // работа зрения, а не рассуждения.
  assert.equal(received.body.output_config.effort, undefined, "раздумья вернулись в разбор фото");
  assert.ok(
    received.body.max_tokens <= 4000,
    `потолок ответа ${received.body.max_tokens} — с таким запасом модель снова уйдёт думать на минуты`,
  );

  const image = received.body.messages[0].content.find((part) => part.type === "image");
  assert.ok(image, "снимок не попал в запрос");
  assert.equal(image.source.media_type, "image/jpeg");
});

test("разбор текста идёт на другую модель и без раздумий", async () => {
  const provider = new AnthropicMealProvider();
  await provider.analyseMeal({ kind: "text", text: "два сырника и капучино" });

  assert.match(received.body.model, /haiku/);
  assert.equal(received.body.output_config.effort, undefined);
  assert.ok(!JSON.stringify(received.body.messages).includes("image"));
});

test("подсказки уходят тем же путём", async () => {
  const provider = new AnthropicSuggestionProvider();
  const result = await provider.suggest({
    remainingKcal: 800,
    remainingProtein: 40,
    remainingFiber: 12,
    mealTypeLabel: "Ужин",
    showCalories: true,
    usualMeals: [],
    eatenToday: [],
    round: 0,
  });

  assert.equal(result.suggestions[0].title, "Творог с ягодами");
  assert.match(received.body.model, /haiku/);
  // Здесь та же связка уцелела случайно: haiku `effort` не понимает вовсе и
  // потому его игнорировал. Полагаться на это нельзя — модель сменится.
  assert.equal(received.body.output_config.effort, undefined);
  assert.ok(received.body.max_tokens <= 4000, `потолок ответа ${received.body.max_tokens}`);
});
