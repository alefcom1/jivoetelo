import type Anthropic from "@anthropic-ai/sdk";
import { INSIGHT_SCHEMA, validateInsight, type Insight, type InsightFacts } from "../report-insight.ts";
import { createAnthropicClient, readUsage, resolveModel, retriesFor, supportsFallbacks, timeoutFor } from "./client.ts";
import { logAiFailure } from "./failure.ts";
import { resolveAiMode } from "./mode.ts";
import { MealAnalysisError, type TokenUsage } from "./types.ts";

/**
 * Разбор питания за период — генеративный слой отчёта.
 *
 * Числа посчитаны нашим кодом и приходят готовыми (lib/report-insight.ts).
 * Здесь модель только смотрит на них и говорит, что видит. Она не считает,
 * не прогнозирует и не назначает — эти три соблазна прямо запрещены в
 * запросе, и каждый из них однажды кончился бы цифрой, которой у нас нет.
 *
 * ## Почему Sonnet, а не Haiku
 *
 * Подсказки «что съесть дальше» идут на Haiku, и правильно: там короткий
 * ответ по готовому списку. Здесь задача другая — связать пять-шесть
 * показателей в наблюдение, которое человек прочтёт как про себя, а не как
 * пересказ таблицы. На Haiku это выходит перечислением.
 *
 * Цена терпима именно из-за частоты: разбор считается раз в неделю и раз в
 * месяц, а не на каждое действие. Порядок — единицы центов на человека в
 * месяц, и это единственная причина, по которой здесь можно позволить себе
 * модель дороже.
 */

const MAX_TOKENS = 700;

const SYSTEM_PROMPT = [
  "Вы — автор раздела «Что заметно» в отчёте дневника питания «Живое Тело».",
  "",
  "Все числа уже посчитаны и даны во входных данных. Ваша работа — увидеть в них картину и",
  "назвать её человеческим языком, в двух-трёх предложениях.",
  "",
  "Запрещено:",
  "— называть числа, которых нет во входных данных. Ни одного. Не считайте, не округляйте,",
  "  не выводите проценты — любая ваша цифра будет выдумкой в сервисе о питании;",
  "— оценивать еду и человека: «много сладкого», «слишком жирно», «стоит взять себя в руки»,",
  "  «плохая неделя». Наблюдение — не приговор;",
  "— советовать диеты, ограничения, голодание и добавки;",
  "— говорить о том, чего нет во входе: шагах, воде, тренировках, сне. Мы их не измеряем;",
  "— обещать результат: «так вы похудеете за месяц».",
  "",
  "Тон: спокойный, на равных, без восторга и без тревоги. Обращение на «вы».",
  "Если данных мало или картина ровная — так и скажите одним предложением. Пустой честный",
  "разбор лучше выдуманного содержательного.",
  "",
  "dishNotes — до трёх коротких заметок о блюдах из списка частых: чем блюдо полезно в этом",
  "рационе или что рядом с ним стоит добавить. Не «уберите», а «посмотрите». Если сказать",
  "нечего — верните пустой массив.",
].join("\n");

export function buildInsightPrompt(facts: InsightFacts): string {
  const lines: string[] = [];
  lines.push(`Период: ${facts.periodLabel}, дней в периоде ${facts.daysInPeriod}.`);
  lines.push(`Дней с записями: ${facts.daysLogged}.`);

  // В режиме «скрыть калории» энергия не показывается человеку вовсе, и
  // упоминать её в разборе нельзя — иначе цифра, которую он сознательно
  // убрал с экрана, вернётся к нему письмом.
  if (facts.showCalories && facts.avgKcal !== null) {
    lines.push(`Среднее за день с записями: ${facts.avgKcal} ккал.`);
    if (facts.targetKcal !== null) lines.push(`Ориентир по энергии: ${facts.targetKcal} ккал.`);
    if (facts.minKcal !== null && facts.maxKcal !== null) {
      lines.push(`Самый лёгкий день: ${facts.minKcal} ккал, самый плотный: ${facts.maxKcal} ккал.`);
    }
  }
  if (facts.avgProtein !== null) {
    lines.push(`Белок в среднем: ${facts.avgProtein} г` + (facts.targetProtein !== null ? `, ориентир ${facts.targetProtein} г.` : "."));
  }
  if (facts.avgFiber !== null) {
    lines.push(`Клетчатка в среднем: ${facts.avgFiber} г` + (facts.targetFiber !== null ? `, ориентир ${facts.targetFiber} г.` : "."));
  }
  if (facts.weightChangeKg !== null) {
    lines.push(`Изменение веса за период: ${facts.weightChangeKg} кг.`);
  }
  if (facts.frequentDishes.length > 0) {
    lines.push("Чаще всего в записях:");
    for (const dish of facts.frequentDishes) lines.push(`— ${dish.name}: ${dish.times} раз(а)`);
  }
  if (!facts.showCalories) {
    lines.push("Человек скрыл калории в настройках: об энергии не упоминайте вовсе.");
  }
  return lines.join("\n");
}

export type InsightResult = { insight: Insight; usage: TokenUsage };

export interface InsightProvider {
  analyze(facts: InsightFacts): Promise<InsightResult>;
}

export class AnthropicInsightProvider implements InsightProvider {
  private client: Anthropic;

  constructor() {
    this.client = createAnthropicClient();
  }

  async analyze(facts: InsightFacts): Promise<InsightResult> {
    const model = resolveModel("review_insight");
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
        output_config: { format: { type: "json_schema", schema: INSIGHT_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildInsightPrompt(facts) }],
      }, { timeout: timeoutFor("review_insight"), maxRetries: retriesFor("review_insight") });
    } catch (error) {
      logAiFailure("review_insight", model, error, startedAt);
      throw new MealAnalysisError("Anthropic request failed", "provider_error");
    }
    if (response.stop_reason === "refusal") throw new MealAnalysisError("Request was refused", "refused");
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new MealAnalysisError("No text block in response", "invalid_output");
    }
    try {
      return { insight: validateInsight(JSON.parse(textBlock.text)), usage: readUsage(response) };
    } catch (error) {
      if (error instanceof MealAnalysisError) throw error;
      throw new MealAnalysisError("Response is not valid JSON", "invalid_output");
    }
  }
}

/** Заглушка для тестов и разработки без ключа. */
export class MockInsightProvider implements InsightProvider {
  async analyze(facts: InsightFacts): Promise<InsightResult> {
    return {
      insight: {
        observation:
          `За ${facts.periodLabel} записей набралось на ${facts.daysLogged} дней — этого хватает, `
          + "чтобы увидеть привычный ритм: рацион держится вокруг одного набора блюд.",
        dishNotes: facts.frequentDishes.slice(0, 1).map((dish) => `${dish.name} — опора рациона.`),
      },
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

export function getInsightProvider(): InsightProvider | null {
  // `null`, а не «провайдер, который всегда отказывает»: вызывающий по этому
  // значению решает, идти ли вообще в модель, и отличать «выключено» от
  // «сломалось» он должен до запроса, а не после.
  const mode = resolveAiMode();
  if (mode === "off") return null;
  if (mode === "mock") return new MockInsightProvider();
  return new AnthropicInsightProvider();
}
