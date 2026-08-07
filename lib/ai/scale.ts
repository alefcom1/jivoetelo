import type Anthropic from "@anthropic-ai/sdk";
import type { RawScaleReading } from "../scale-reading.ts";
import { createAnthropicClient, readUsage, resolveModel, retriesFor, supportsFallbacks, timeoutFor } from "./client.ts";
import { logAiFailure } from "./failure.ts";
import { compressPhotoForAi } from "./image.ts";
import { resolveAiMode } from "./mode.ts";
import { MealAnalysisError, type MealInput, type TokenUsage } from "./types.ts";

/**
 * Чтение показаний напольных весов со снимка.
 *
 * ## Почему это отдельный путь, а не разбор фото
 *
 * Разбор еды и чтение индикатора выглядят одинаково («картинка → число»), но
 * ломаются от разного. Еде нужны цвет, форма и относительный размер — по ним
 * модель узнаёт гречку, и разрешение при этом почти не важно. Индикатору
 * нужны ровно пиксели: цифра высотой сорок точек читается, высотой пятнадцать
 * — нет, а «примерно 8» здесь не бывает.
 *
 * Отсюда все различия: свой промпт, своя схема ответа и другой предел
 * уменьшения снимка (MAX_DIMENSION_PX в lib/ai/image.ts сжимает до 1024 —
 * для дисплея, занимающего шестую часть кадра, это уже каша).
 *
 * ## Что модель обязана делать и чего не должна
 *
 * Не должна — угадывать. Отказ «не разобрать» стоит человеку одного лишнего
 * кадра, а угаданная цифра уходит в тренд и двигает план (см. рассуждение в
 * lib/scale-reading.ts). Поэтому промпт трижды говорит одно: не уверен —
 * скажи, что не уверен.
 *
 * Обязана — читать в любом повороте. Весы снимают стоя над ними, держа
 * телефон как придётся: дисплей на снимке лежит боком, вверх ногами или под
 * углом чаще, чем ровно.
 */

const SYSTEM_PROMPT = `Ты читаешь показания напольных весов с фотографии. Отвечай строго по схеме.

Что нужно найти: число на индикаторе весов и единицу измерения рядом с ним (kg / кг, lb, st).

Условия съёмки, к которым нужно быть готовым:
- Кадр снят сверху, стоя над весами. Дисплей на снимке почти никогда не расположен ровно: он может быть повёрнут на 90 или 180 градусов, лежать под углом, быть заметно меньше остального кадра. Поворот — это норма, а не помеха: прочитай число в том положении, в котором оно есть.
- Индикатор семисегментный, часто с подсветкой, на тёмном глянцевом стекле. Блики, отражения комнаты, пыль и разводы на стекле — обычное дело.
- Некоторые весы по очереди показывают вес, процент жира, воду, мышечную массу. Нужен ТОЛЬКО вес — число в килограммах или фунтах. Если на индикаторе явно не вес (например, "23.4 %" или надпись вроде "Err", "Lo", "----"), верни problem: "not_weight".

Как читать:
- Разряд десятых отделяется точкой или запятой; у многих весов десятая доля показана мелкой цифрой справа или после точки. Не теряй её и не выдумывай: 82.5 и 825 отличаются в десять раз.
- Ведущие нули не дописывай.
- Если единицы измерения на индикаторе нет, но число похоже на вес человека в килограммах — ставь unit: "kg". Если число больше 150 и единиц не видно, скорее всего это фунты: ставь unit: "lb" и confidence не выше "medium".

Об уверенности — главное правило:
- confidence: "high" — все цифры видны отчётливо и читаются однозначно.
- confidence: "medium" — читается, но какой-то сегмент под бликом или размыт.
- confidence: "low" — прочитал, но одна из цифр может быть другой (8/0/6/9 путаются чаще всего).
- Если цифры разобрать нельзя — НЕ УГАДЫВАЙ. Верни reading: null и problem: "unreadable". Лишний кадр стоит человеку пяти секунд, а неверное число попадёт в его историю веса и изменит расчёты. Отказ здесь всегда лучше догадки.
- Если на снимке вообще нет весов или индикатор не горит — problem: "no_display".`;

const SCALE_READING_SCHEMA = {
  type: "object",
  properties: {
    reading: {
      type: ["number", "null"],
      description: "Число на индикаторе в тех единицах, что показаны на нём. null, если прочитать нельзя.",
    },
    unit: { type: ["string", "null"], enum: ["kg", "lb", "st", null] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    problem: { type: ["string", "null"], enum: ["no_display", "unreadable", "not_weight", null] },
  },
  required: ["reading", "unit", "confidence", "problem"],
  additionalProperties: false,
} as const;

/**
 * Ответ короче некуда: четыре поля. Потолок не «на всякий случай» побольше —
 * при большом бюджете модель уходит в рассуждения, а рассуждать тут не о чем
 * (разбор этой ловушки — у MAX_TOKENS в lib/ai/anthropic.ts).
 */
const MAX_TOKENS = 300;

/**
 * Предел уменьшения снимка именно для этой задачи.
 *
 * 1568 — граница, ниже которой Anthropic не масштабирует картинку сама.
 * Взято не ради красоты: на телефонном кадре 4032×3024 дисплей занимает
 * примерно шестую часть ширины, то есть цифра высотой около 250 точек. После
 * обычного сжатия до 1024 от неё останется 60, после этого — 100. Разница
 * между «читается» и «одна из цифр под вопросом» проходит примерно здесь.
 */
const SCALE_MAX_DIMENSION_PX = 1568;

export type ScaleReadingResult = { reading: RawScaleReading; usage: TokenUsage };

export interface ScaleVisionProvider {
  readScale(input: Extract<MealInput, { kind: "photo" }>): Promise<ScaleReadingResult>;
}

export class AnthropicScaleProvider implements ScaleVisionProvider {
  private client: Anthropic;

  constructor() {
    this.client = createAnthropicClient();
  }

  async readScale(input: Extract<MealInput, { kind: "photo" }>): Promise<ScaleReadingResult> {
    // Снимок весов уходит телом, а не ссылкой: в отличие от еды, в хранилище
    // он не попадает вовсе. Хранить фотографию весов незачем — из неё нужно
    // ровно одно число, и оно сохраняется отдельной строкой замера.
    const compressed = await compressPhotoForAi(input.data, Number.POSITIVE_INFINITY, SCALE_MAX_DIMENSION_PX);
    const photo = compressed ?? { data: input.data, mediaType: input.mediaType };

    const operation = "read_scale" as const;
    const model = resolveModel(operation);
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
        output_config: { format: { type: "json_schema", schema: SCALE_READING_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: photo.mediaType, data: photo.data.toString("base64") },
            },
            { type: "text", text: "Прочитай показания весов на этом снимке." },
          ],
        }],
      }, { timeout: timeoutFor(operation), maxRetries: retriesFor(operation) });
    } catch (error) {
      logAiFailure(operation, model, error, startedAt);
      throw new MealAnalysisError("Anthropic scale request failed", "provider_error");
    }

    if (response.stop_reason === "refusal") {
      throw new MealAnalysisError("Scale request was refused by safety classifiers", "refused");
    }
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new MealAnalysisError("No text block in scale response", "invalid_output");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      throw new MealAnalysisError("Scale response is not valid JSON", "invalid_output");
    }
    return { reading: validateScaleReading(parsed), usage: readUsage(response) };
  }
}

/**
 * Провайдер для разработки: одно и то же правдоподобное показание.
 *
 * Число выбрано так, чтобы проходило проверку диапазона и не спорило с
 * тестовыми данными: поток «снял → подставилось → сохранил» проходится
 * целиком без ключа.
 */
export class MockScaleProvider implements ScaleVisionProvider {
  async readScale(): Promise<ScaleReadingResult> {
    return {
      reading: { reading: 82.5, unit: "kg", confidence: "high", problem: null },
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

export class DisabledScaleProvider implements ScaleVisionProvider {
  async readScale(): Promise<ScaleReadingResult> {
    throw new MealAnalysisError("Scale reading is disabled (AI_PROVIDER=off)", "disabled");
  }
}

let provider: ScaleVisionProvider | null = null;

export function getScaleProvider(): ScaleVisionProvider {
  if (provider) return provider;
  switch (resolveAiMode()) {
    case "mock": provider = new MockScaleProvider(); break;
    case "off": provider = new DisabledScaleProvider(); break;
    default: provider = new AnthropicScaleProvider();
  }
  return provider;
}

/**
 * Проверка ответа модели. Схема на стороне провайдера уже гарантирует форму,
 * но полагаться только на неё нельзя: она проверяется там же, где отвечает
 * модель, и на неё нет наших тестов.
 */
export function validateScaleReading(value: unknown): RawScaleReading {
  if (typeof value !== "object" || value === null) {
    throw new MealAnalysisError("Scale reading is not an object", "invalid_output");
  }
  const raw = value as Record<string, unknown>;

  const reading = raw.reading === null || raw.reading === undefined ? null : Number(raw.reading);
  if (reading !== null && !Number.isFinite(reading)) {
    throw new MealAnalysisError("Scale reading is not a number", "invalid_output");
  }

  const unit = raw.unit === "kg" || raw.unit === "lb" || raw.unit === "st" ? raw.unit : null;
  const confidence = raw.confidence === "high" || raw.confidence === "low" ? raw.confidence : "medium";
  const problem =
    raw.problem === "no_display" || raw.problem === "unreadable" || raw.problem === "not_weight"
      ? raw.problem
      : null;

  return { reading, unit, confidence, problem };
}
