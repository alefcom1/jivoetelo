import Anthropic from "@anthropic-ai/sdk";
import { MEAL_ANALYSIS_SCHEMA, validateMealAnalysis } from "./schema.ts";
import { MealAnalysisError, type MealAnalysis, type MealInput, type MealVisionProvider } from "./types.ts";

const DEFAULT_MODEL = "claude-opus-5";

// Языковые правила из раздела 4.3 спецификации зашиты в системный промпт:
// никаких оценочных формулировок про еду и пользователя.
const SYSTEM_PROMPT = `Ты — ассистент нутрициолога в сервисе «Живое Тело». Твоя задача — разобрать описание или фото приёма пищи на компоненты.

Правила оценки:
- Оценивай вес порций и состав честно: не изображай точность, которой нет. Если не уверен — ставь confidence "medium" или "low".
- Значения КБЖУ на 100 г давай усреднённые для типичного способа приготовления. Учитывай русскую кухню и привычные российские продукты и порции.
- Скрытые ингредиенты (масло при жарке, заправка, сахар в напитке, соус) либо включай отдельной позицией с confidence "low", либо выноси в уточняющий вопрос.
- Задавай не больше двух уточняющих вопросов и только когда ответ заметно меняет итог. К каждому варианту ответа, который добавляет продукт, прикладывай addItem с его оценкой.
- Названия компонентов пиши по-русски, коротко и нейтрально.

Языковые правила (обязательно): никаких оценок и морализаторства. Запрещены формулировки вида «плохая еда», «вредно», «запрещённый продукт», «слишком много». Ты описываешь еду, а не судишь её.`;

export class AnthropicMealProvider implements MealVisionProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model ?? DEFAULT_MODEL;
  }

  async analyseMeal(input: MealInput): Promise<MealAnalysis> {
    const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
    if (input.kind === "photo") {
      content.push({
        type: "image",
        source: { type: "base64", media_type: input.mediaType, data: input.data.toString("base64") },
      });
      content.push({
        type: "text",
        text: input.note
          ? `Разбери приём пищи на этом фото. Комментарий пользователя: ${input.note}`
          : "Разбери приём пищи на этом фото.",
      });
    } else {
      content.push({ type: "text", text: `Разбери описание приёма пищи: ${input.text}` });
    }

    // Фолбэк на случай срабатывания классификаторов безопасности:
    // на opus-5/fable-5 запрос перезапускается на рекомендованной модели.
    const supportsFallbacks = this.model.startsWith("claude-opus-5") || this.model.startsWith("claude-fable");

    let response: Anthropic.Beta.Messages.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        ...(supportsFallbacks
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: MEAL_ANALYSIS_SCHEMA },
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      });
    } catch (error) {
      console.error("meal analysis request failed", error);
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
    return validateMealAnalysis(parsed);
  }
}
