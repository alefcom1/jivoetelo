import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient, readUsage, resolveModel, retriesFor, supportsFallbacks, timeoutFor } from "./client.ts";
import { logAiFailure } from "./failure.ts";
import { compressPhotoForAi } from "./image.ts";
import { photoLinkFor } from "./photo-link.ts";
import { MEAL_ANALYSIS_SCHEMA, validateMealAnalysis } from "./schema.ts";
import { MealAnalysisError, type MealAnalysisResult, type MealInput, type MealVisionProvider } from "./types.ts";

// Языковые правила из раздела 4.3 спецификации зашиты в системный промпт:
// никаких оценочных формулировок про еду и пользователя.
const SYSTEM_PROMPT = `Ты — ассистент нутрициолога в сервисе «Живое Тело». Твоя задача — разобрать описание или фото приёма пищи на компоненты.

Правила оценки:
- Оценивай вес порций и состав честно: не изображай точность, которой нет. Если не уверен — ставь confidence "medium" или "low".
- Значения КБЖУ на 100 г давай усреднённые для типичного способа приготовления. Учитывай русскую кухню и привычные российские продукты и порции.
- Скрытые ингредиенты (масло при жарке, заправка, сахар в напитке, соус) либо включай отдельной позицией с confidence "low", либо выноси в уточняющий вопрос.
- Задавай не больше двух уточняющих вопросов и только когда ответ заметно меняет итог. К каждому варианту ответа, который добавляет продукт, прикладывай addItem с его оценкой.
- Названия компонентов пиши по-русски, коротко и нейтрально.
- Поле alcohol — этиловый спирт в ГРАММАХ на 100 г, а не крепость в процентах. Пересчитывай: граммы = проценты крепости × 0,79. Для всего безалкогольного ставь 0.
- Калорийность должна сходиться с составом: белки и усвояемые углеводы по 4 ккал/г, жиры 9, клетчатка 2, спирт 7.

Языковые правила (обязательно): никаких оценок и морализаторства. Запрещены формулировки вида «плохая еда», «вредно», «запрещённый продукт», «слишком много». Ты описываешь еду, а не судишь её.`;

/**
 * Потолок ответа — и почему он не шестнадцать тысяч.
 *
 * ## Что случилось
 *
 * Разбор фото не работал: модель не отвечала за две минуты, запрос обрывался
 * по таймауту, в логе — две строки «Request timed out» подряд. Ни отказа
 * сервера, ни обрыва связи: модель действительно столько думала.
 *
 * Думала она потому, что мы её об этом просили. В запросе стояло
 * `effort: "medium"` при `max_tokens: 16000` — то есть «размышляй, бюджет
 * почти не ограничен». Для задачи «прочитать тарелку и выдать JSON» это
 * бессмысленно дорого: узнавание еды — работа зрения, а не рассуждения, и
 * пятнадцать тысяч токенов раздумий не делают гречку гречкой вернее.
 *
 * ## Что теперь
 *
 * `effort` не задаётся вовсе, а потолок сведён к тому, что нужно ответу:
 * разбор из десятка позиций с уточняющими вопросами укладывается в тысячу
 * токенов с запасом. Четыре тысячи — запас на запас; при этом бюджет уже не
 * позволяет уйти в раздумья на минуты.
 *
 * Разбор текста шёл тем же путём и работал только потому, что haiku `effort`
 * не понимает вовсе (см. supportsEffort) — то есть работал случайно.
 */
const MAX_TOKENS = 4000;

export class AnthropicMealProvider implements MealVisionProvider {
  private client: Anthropic;

  constructor() {
    this.client = createAnthropicClient();
  }

  async analyseMeal(input: MealInput): Promise<MealAnalysisResult> {
    const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
    if (input.kind === "photo") {
      // Ссылка вместо байтов, когда снимок уже лежит в хранилище: тело
      // тяжелее ~32 КБ до прокси не доезжает, и сжатием это не лечится
      // (замеры и разбор — в lib/ai/photo-link.ts). Модель скачает снимок
      // с нашего сервера сама, а наружу уйдёт пара килобайт JSON.
      const link = input.photoKey ? photoLinkFor(input.photoKey) : null;
      if (link) {
        content.push({ type: "image", source: { type: "url", url: link } });
      } else {
        // Запасной путь: разработка без HTTPS и снимки, которых в хранилище
        // ещё нет. Сжимаем перед отправкой (lib/ai/image.ts) — в хранилище и
        // пользователю уходит оригинал, `input.data` здесь не трогаем.
        const compressed = await compressPhotoForAi(input.data);
        const photo = compressed ?? { data: input.data, mediaType: input.mediaType };
        content.push({
          type: "image",
          source: { type: "base64", media_type: photo.mediaType, data: photo.data.toString("base64") },
        });
      }
      content.push({
        type: "text",
        text: input.note
          ? `Разбери приём пищи на этом фото. Комментарий пользователя: ${input.note}`
          : "Разбери приём пищи на этом фото.",
      });
    } else {
      content.push({ type: "text", text: `Разбери описание приёма пищи: ${input.text}` });
    }

    const operation = input.kind === "photo" ? "analyze_photo" : "analyze_text";
    const model = resolveModel(operation);

    // Фолбэк на случай срабатывания классификаторов безопасности:
    // на opus-5/fable-5 запрос перезапускается на рекомендованной модели.
    const withFallbacks = supportsFallbacks(model);

    let response: Anthropic.Beta.Messages.BetaMessage;
    const startedAt = Date.now();
    try {
      response = await this.client.beta.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        ...(withFallbacks
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
        output_config: {
          // effort здесь не задаётся сознательно — см. рассуждение у MAX_TOKENS.
          format: { type: "json_schema", schema: MEAL_ANALYSIS_SCHEMA },
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
        // Предел на запрос, а не на клиента: разбор снимка и разбор строки —
        // задачи разного веса, и один общий предел на обе уже ломал первую.
      }, { timeout: timeoutFor(operation), maxRetries: retriesFor(operation) });
    } catch (error) {
      logAiFailure(operation, model, error, startedAt);
      throw new MealAnalysisError("Anthropic request failed", "provider_error");
    }

    if (response.stop_reason === "refusal") {
      throw new MealAnalysisError("Request was refused by safety classifiers", "refused");
    }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new MealAnalysisError("No text block in response", "invalid_output");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      throw new MealAnalysisError("Response is not valid JSON", "invalid_output");
    }
    return { analysis: validateMealAnalysis(parsed), usage: readUsage(response) };
  }
}
