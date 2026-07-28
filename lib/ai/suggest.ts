import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient, DEFAULT_MODEL, hasAnthropicCredentials, readUsage, supportsFallbacks } from "./client.ts";
import { MealAnalysisError, type TokenUsage } from "./types.ts";

// «Что съесть дальше» (разделы 8.8 и 15.5 спецификации): детерминированный
// слой считает остатки дня и ограничения (наш код), генеративный слой
// подбирает варианты и объясняет, почему они подходят.

export type SuggestionContext = {
  remainingKcal: number;
  remainingProtein: number;
  remainingFiber: number;
  mealTypeLabel: string;
  showCalories: boolean;
};

export type MealSuggestion = {
  title: string;
  why: string;
  approxKcal: number;
  approxProtein: number;
  timeMinutes: number;
};

export type SuggestionResult = { suggestions: MealSuggestion[]; usage: TokenUsage };

export interface SuggestionProvider {
  suggest(context: SuggestionContext): Promise<SuggestionResult>;
}

const SUGGESTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "why", "approxKcal", "approxProtein", "timeMinutes"],
        properties: {
          title: { type: "string", description: "Короткое название блюда по-русски" },
          why: { type: "string", description: "Одно предложение: почему вариант подходит сейчас" },
          approxKcal: { type: "number" },
          approxProtein: { type: "number", description: "белок, г" },
          timeMinutes: { type: "number", description: "время приготовления в минутах" },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `Ты — ассистент сервиса «Живое Тело». Подбери 3 варианта следующего приёма пищи под остаток дня пользователя.

Правила:
- Простые блюда из продуктов, привычных в России; хотя бы один вариант почти без готовки.
- Каждый вариант должен разумно вписываться в остаток по калориям и помогать добрать белок и клетчатку, если их не хватает.
- В поле why — одно предложение без цифр процентов: почему вариант подходит именно сейчас.
- Язык поддерживающий и нейтральный. Запрещены оценки («плохая еда», «вредно», «слишком много»), призывы «компенсировать» и «отработать».
- Если остаток по калориям небольшой, предлагай лёгкие варианты — без комментариев о том, что пользователь «превысил» план.`;

function clamp(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function validateSuggestions(raw: unknown): MealSuggestion[] {
  if (typeof raw !== "object" || raw === null) {
    throw new MealAnalysisError("Suggestions are not an object", "invalid_output");
  }
  const list = (raw as Record<string, unknown>).suggestions;
  const suggestions = (Array.isArray(list) ? list : [])
    .map((item): MealSuggestion | null => {
      if (typeof item !== "object" || item === null) return null;
      const s = item as Record<string, unknown>;
      const title = typeof s.title === "string" ? s.title.trim().slice(0, 120) : "";
      const why = typeof s.why === "string" ? s.why.trim().slice(0, 300) : "";
      if (!title || !why) return null;
      return {
        title,
        why,
        approxKcal: Math.round(clamp(s.approxKcal, 0, 2000)),
        approxProtein: Math.round(clamp(s.approxProtein, 0, 150)),
        timeMinutes: Math.round(clamp(s.timeMinutes, 0, 120)),
      };
    })
    .filter((s): s is MealSuggestion => s !== null)
    .slice(0, 3);
  if (suggestions.length === 0) {
    throw new MealAnalysisError("No usable suggestions", "invalid_output");
  }
  return suggestions;
}

function buildPrompt(context: SuggestionContext): string {
  const lines = [
    `Следующий приём пищи: ${context.mealTypeLabel}.`,
    `Остаток на сегодня: примерно ${Math.max(0, Math.round(context.remainingKcal))} ккал, белка не хватает ${Math.max(0, Math.round(context.remainingProtein))} г, клетчатки ${Math.max(0, Math.round(context.remainingFiber))} г.`,
  ];
  if (!context.showCalories) {
    lines.push("Пользователь скрыл калории: в поле why не упоминай калории, говори о сытости, белке и овощах.");
  }
  return lines.join("\n");
}

export class AnthropicSuggestionProvider implements SuggestionProvider {
  private client: Anthropic;
  private model: string;

  constructor(model?: string) {
    this.client = createAnthropicClient();
    this.model = model ?? DEFAULT_MODEL;
  }

  async suggest(context: SuggestionContext): Promise<SuggestionResult> {
    const withFallbacks = supportsFallbacks(this.model);
    let response: Anthropic.Beta.Messages.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        ...(withFallbacks
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: SUGGESTIONS_SCHEMA },
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildPrompt(context) }],
      });
    } catch (error) {
      console.error("suggestion request failed", error);
      throw new MealAnalysisError("Anthropic request failed", "provider_error");
    }
    if (response.stop_reason === "refusal") {
      throw new MealAnalysisError("Request was refused", "refused");
    }
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new MealAnalysisError("No text block in response", "invalid_output");
    }
    try {
      return { suggestions: validateSuggestions(JSON.parse(textBlock.text)), usage: readUsage(response) };
    } catch (error) {
      if (error instanceof MealAnalysisError) throw error;
      throw new MealAnalysisError("Response is not valid JSON", "invalid_output");
    }
  }
}

export class MockSuggestionProvider implements SuggestionProvider {
  async suggest(context: SuggestionContext): Promise<SuggestionResult> {
    const light = context.remainingKcal < 500;
    const suggestions: MealSuggestion[] = [
      {
        title: light ? "Омлет с овощами" : "Гречка с курицей и овощами",
        why: "Помогает добрать белок и оставляет запас до конца дня.",
        approxKcal: light ? 320 : 550,
        approxProtein: light ? 22 : 42,
        timeMinutes: 15,
      },
      {
        title: "Творог с ягодами",
        why: "Почти без готовки и хорошо насыщает.",
        approxKcal: 250,
        approxProtein: 28,
        timeMinutes: 3,
      },
      {
        title: "Овощной салат с тунцом",
        why: "Добавляет клетчатку, которой сегодня не хватает.",
        approxKcal: 330,
        approxProtein: 25,
        timeMinutes: 10,
      },
    ];
    return { suggestions, usage: { inputTokens: 540, outputTokens: 320 } };
  }
}

let suggestionProvider: SuggestionProvider | null = null;

export function getSuggestionProvider(): SuggestionProvider {
  if (suggestionProvider) return suggestionProvider;
  if (process.env.AI_PROVIDER === "mock" || !hasAnthropicCredentials()) {
    suggestionProvider = new MockSuggestionProvider();
  } else {
    suggestionProvider = new AnthropicSuggestionProvider(process.env.ANTHROPIC_MODEL);
  }
  return suggestionProvider;
}
