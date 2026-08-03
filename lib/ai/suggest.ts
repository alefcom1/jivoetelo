import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient, readUsage, resolveModel, retriesFor, supportsFallbacks, timeoutFor } from "./client.ts";
import { DisabledSuggestionProvider } from "./disabled.ts";
import { logAiFailure } from "./failure.ts";
import { resolveAiMode } from "./mode.ts";
import { MealAnalysisError, type TokenUsage } from "./types.ts";

// «Что съесть дальше» (разделы 8.8 и 15.5 спецификации): детерминированный
// слой считает остатки дня и ограничения (наш код), генеративный слой
// подбирает варианты и объясняет, почему они подходят.

export type SuggestionContext = {
  remainingKcal: number;
  remainingProtein: number;
  remainingFiber: number;
  /**
   * Потолки, а не цели. Жир и углеводы — остаток от калорий и белка
   * (lib/macro-split.ts), и «добрать углеводов» мы не предлагаем никогда:
   * это числовой перфекционизм, от которого продукт отстраивается. Модели
   * они нужны затем, чтобы не советовать блюдо, выносящее за остаток вдвое.
   */
  fatLeft: number;
  carbsLeft: number;
  mealTypeLabel: string;
  showCalories: boolean;
  /**
   * Что человек ел в последние недели — названия приёмов пищи из его же
   * дневника (lib/suggest-context.ts). Пусто у новичка: пока записей нет,
   * опираться не на что.
   */
  usualMeals: string[];
  /** Что уже съедено сегодня — чтобы не предлагать это снова. */
  eatenToday: string[];
  /**
   * Какой это по счёту заход за подсказками. Ноль — первый; дальше каждое
   * «Показать другие» увеличивает счётчик, и запрос смотрит на еду с другой
   * стороны (см. SUGGEST_ANGLES).
   */
  round: number;
};

/**
 * Углы подбора: с какой стороны смотреть на еду в этот заход.
 *
 * ## Зачем понадобилось
 *
 * «Показать другие» выдавало практически то же самое: омлет, творог, гречка
 * с курицей — и так каждый раз, с точностью до перестановки слов. Дело не в
 * температуре модели: запрос был один и тот же, а на один и тот же запрос
 * есть один самый вероятный ответ, и лёгкий разброс его не меняет.
 *
 * Значит, менять надо запрос. Углы подобраны так, чтобы пересекаться как
 * можно меньше: другой источник белка, другая крупа, холодное вместо
 * горячего, суп вместо тарелки, другая кухня. Между ними трудно выдать одно
 * и то же блюдо, даже стараясь.
 *
 * ## Почему это на сервере, а не приходит от клиента
 *
 * От клиента приходит только число. Список формулировок живёт здесь: текст,
 * попадающий в запрос к модели, снаружи не принимается вовсе — иначе через
 * него можно было бы дописать в запрос что угодно.
 */
export const SUGGEST_ANGLES: string[] = [
  // Первый заход — без ограничений: человек ещё ничего не видел.
  "",
  "В этот раз обойдись без яиц, творога и куриной грудки — с них начинают всегда. Возьми другие источники белка: рыбу, морепродукты, бобовые, сыр, индейку, говядину.",
  "Сделай упор на крупы и овощи, о которых обычно забывают: перловка, булгур, чечевица, нут, фасоль, капуста, свёкла, тыква, кабачки.",
  "Предложи то, что едят холодным или собирают без плиты: салаты, намазки, рулеты из лаваша, бутерброды с начинкой, холодные супы.",
  "Возьми домашние горячие блюда: суп, тушёное, запечённое в духовке, приготовленное в одной кастрюле или на одной сковороде.",
  "Предложи блюда других кухонь из продуктов обычного магазина: шакшука, боул, карри, паста, тортилья, фалафель, том-ям.",
];

/** Угол для захода. Круг замыкается: седьмое нажатие начинает сначала. */
export function angleFor(round: number): string {
  const index = Number.isFinite(round) ? Math.max(0, Math.floor(round)) % SUGGEST_ANGLES.length : 0;
  return SUGGEST_ANGLES[index];
}

export type MealSuggestion = {
  title: string;
  why: string;
  approxKcal: number;
  approxProtein: number;
  /** Клетчатка — второй «пол» дня, и сверять её надо, а не верить на слово. */
  approxFiber: number;
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
        required: ["title", "why", "approxKcal", "approxProtein", "approxFiber", "timeMinutes"],
        properties: {
          title: { type: "string", description: "Короткое название блюда по-русски" },
          why: { type: "string", description: "Одно предложение: почему вариант подходит сейчас" },
          approxKcal: { type: "number" },
          approxProtein: { type: "number", description: "белок, г" },
          approxFiber: { type: "number", description: "клетчатка, г" },
          timeMinutes: { type: "number", description: "время приготовления в минутах" },
        },
      },
    },
  },
} as const;

/**
 * Потолок ответа. Три варианта блюд с объяснениями — это сотни токенов, а не
 * тысячи; здесь стояло 16000 вместе с `effort: "medium"`, и на разборе фото
 * такая же связка обернулась ответом дольше двух минут (см. MAX_TOKENS в
 * ./anthropic.ts). Подсказки уцелели случайно: они идут на haiku, который
 * `effort` не понимает вовсе и потому его игнорировал.
 */
const MAX_TOKENS = 2000;

const SYSTEM_PROMPT = `Ты — ассистент сервиса «Живое Тело». Подбери 3 варианта следующего приёма пищи под остаток дня пользователя.

Правила:
- Простые блюда из продуктов, привычных в России; хотя бы один вариант почти без готовки.
- Каждый вариант должен разумно вписываться в остаток по калориям и помогать добрать белок и клетчатку, если их не хватает.
- В поле why — одно предложение без цифр процентов: почему вариант подходит именно сейчас.
- Язык поддерживающий и нейтральный. Запрещены оценки («плохая еда», «вредно», «слишком много»), призывы «компенсировать» и «отработать».
- Если остаток по калориям небольшой, предлагай лёгкие варианты — без комментариев о том, что пользователь «превысил» план.
- Если известно, что человек ел в последние недели: два варианта — из этого круга или близкие к нему, третий — новый. Только знакомое он и без нас знает; только новое он не купит и не приготовит.
- Не предлагай то, что уже съедено сегодня.
- Три варианта в одном ответе — три разных блюда, а не три вариации одного. Омлет и яичница, творог с ягодами и творог с бананом — это один вариант, а не два.`;

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
        approxFiber: Math.round(clamp(s.approxFiber, 0, 60)),
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

/**
 * Сборка запроса. Экспортируется ради тестов: это единственное место, где
 * дневник человека превращается в текст для модели, и содержимое этого
 * текста стоит проверять, а не полагаться на живой вызов.
 */
export function buildPrompt(context: SuggestionContext): string {
  const lines = [
    `Следующий приём пищи: ${context.mealTypeLabel}.`,
    `Остаток на сегодня: примерно ${Math.max(0, Math.round(context.remainingKcal))} ккал, белка не хватает ${Math.max(0, Math.round(context.remainingProtein))} г, клетчатки ${Math.max(0, Math.round(context.remainingFiber))} г.`,
  ];
  // Потолки — отдельной строкой и только когда они заданы. Оговорка «границы,
  // а не цели» обязательна: без неё модель начинает предлагать «добрать
  // жиров», а это ровно та подача, которой у нас быть не должно. Ноль
  // означает «ограничение не задано» (веб-вызов их не присылает), и молчание
  // здесь честнее, чем строка «уместится 0 г жира».
  if (context.fatLeft > 0 || context.carbsLeft > 0) {
    lines.push(
      `Ещё уместится примерно ${Math.round(context.fatLeft)} г жира и ${Math.round(context.carbsLeft)} г углеводов — ` +
        "это границы, а не цели: добирать их не нужно, но и сильно выходить за них не стоит.",
    );
  }
  // Дневник — главное, чего подсказкам не хватало: раньше модель получала
  // только числа и выдумывала блюда с нуля, не зная человека вовсе.
  // Формулировка осторожная: часть строк — повторы, часть просто недавнее,
  // и выдавать разовый ужин за привычку модели не стоит.
  if (context.usualMeals.length > 0) {
    lines.push(`Из дневника, что человек ел в последние недели: ${context.usualMeals.join("; ")}.`);
  }
  if (context.eatenToday.length > 0) {
    lines.push(`Сегодня уже съедено: ${context.eatenToday.join(", ")}.`);
  }
  if (!context.showCalories) {
    lines.push("Пользователь скрыл калории: в поле why не упоминай калории, говори о сытости, белке и овощах.");
  }
  // Угол — последней строкой: он уточняет уже поставленную задачу, а не
  // заменяет её, и в таком порядке модель не забывает про остаток дня.
  const angle = angleFor(context.round);
  if (angle) lines.push(angle);
  return lines.join("\n");
}

export class AnthropicSuggestionProvider implements SuggestionProvider {
  private client: Anthropic;

  constructor() {
    this.client = createAnthropicClient();
  }

  async suggest(context: SuggestionContext): Promise<SuggestionResult> {
    const model = resolveModel("suggest");
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
          // effort здесь не задаётся сознательно: см. MAX_TOKENS выше.
          format: { type: "json_schema", schema: SUGGESTIONS_SCHEMA },
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildPrompt(context) }],
      }, { timeout: timeoutFor("suggest"), maxRetries: retriesFor("suggest") });
    } catch (error) {
      logAiFailure("suggest", model, error, startedAt);
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
        approxFiber: light ? 4 : 6,
        timeMinutes: 15,
      },
      {
        title: "Творог с ягодами",
        why: "Почти без готовки и хорошо насыщает.",
        approxKcal: 250,
        approxProtein: 28,
        approxFiber: 3,
        timeMinutes: 3,
      },
      {
        title: "Овощной салат с тунцом",
        why: "Добавляет клетчатку, которой сегодня не хватает.",
        approxKcal: 330,
        approxProtein: 25,
        approxFiber: 8,
        timeMinutes: 10,
      },
    ];
    return { suggestions, usage: { inputTokens: 540, outputTokens: 320 } };
  }
}

let suggestionProvider: SuggestionProvider | null = null;

export function getSuggestionProvider(): SuggestionProvider {
  if (suggestionProvider) return suggestionProvider;
  switch (resolveAiMode()) {
    case "mock": suggestionProvider = new MockSuggestionProvider(); break;
    case "off": suggestionProvider = new DisabledSuggestionProvider(); break;
    default: suggestionProvider = new AnthropicSuggestionProvider();
  }
  return suggestionProvider;
}
