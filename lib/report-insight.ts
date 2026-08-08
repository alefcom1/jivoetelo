/**
 * Разбор питания в отчёте: что заметно за период и на что посмотреть.
 *
 * ## Что здесь модель, а что нет — и почему граница проведена именно так
 *
 * Модуль чистый: ни базы, ни сети. Он готовит **сводку фактов** для модели и
 * проверяет её ответ. Сам вызов — в lib/ai/insight.ts.
 *
 * Разделение труда жёсткое, и это главное решение всего разбора:
 *
 * - **Числа считаем мы.** Средние, разброс, доля дней с записями, частые
 *   блюда — всё посчитано нашим кодом и попадает в запрос готовым. Модель не
 *   считает ничего: сервис о питании, где цифру придумала языковая модель, —
 *   это сервис, которому нельзя верить, и одной такой цифры хватит.
 * - **Модель пишет наблюдения.** Что из этих чисел складывается в картину, на
 *   какие блюда посмотреть, что изменилось к прошлому периоду. Это как раз
 *   работа для языка, а не для формулы.
 * - **Привычки вокруг еды — снова мы.** Вода, шаги, движение, алкоголь. Мы их
 *   не измеряем, поэтому модели про них знать нечего: она бы неизбежно
 *   написала «вы мало ходили», а мы этого не знаем. Строки собираются
 *   детерминированно (`habitReminders`) и чередуются, чтобы не превратиться
 *   в один и тот же хвост каждую неделю.
 *
 * ## Про тон
 *
 * Те же правила, что у всего продукта: никаких оценок еды и человека. «Много
 * сладкого», «слишком жирно», «стоит взять себя в руки» — запрещены. Разбор
 * называет наблюдение и оставляет решение человеку. За этим следит тест.
 */

import type { DayStat } from "./review.ts";
import type { Targets } from "./targets.ts";
import type { ReportSection } from "./report.ts";

/**
 * Сводка фактов для модели. Только агрегаты: ни одного сырого названия
 * приёма пищи с комментарием человека, ни дат, ни веса в килограммах.
 * Разбор — не повод отправлять наружу дневник целиком.
 */
export type InsightFacts = {
  /** «неделя» или «месяц» — от этого зависит, о чём вообще уместно говорить. */
  periodLabel: string;
  daysInPeriod: number;
  daysLogged: number;
  /** Средние за дни С ЗАПИСЯМИ. По всем дням они смешали бы еду и дисциплину. */
  avgKcal: number | null;
  avgProtein: number | null;
  avgFiber: number | null;
  targetKcal: number | null;
  targetProtein: number | null;
  targetFiber: number | null;
  /** Самый лёгкий и самый плотный день — разброс говорит больше среднего. */
  minKcal: number | null;
  maxKcal: number | null;
  /** Что человек ел чаще всего: название и сколько раз за период. */
  frequentDishes: Array<{ name: string; times: number }>;
  /** Изменение веса за период, кг. null — замеров мало. */
  weightChangeKg: number | null;
  /** Показываем ли человеку калории вообще (lib/quota-policy.ts, режим без цифр). */
  showCalories: boolean;
};

/**
 * Сколько дней с записями нужно, чтобы разбор имел смысл.
 *
 * Три — не «побольше для солидности». По двум дням любое наблюдение
 * оказывается наблюдением о двух днях, а звучит как вывод о человеке; такой
 * разбор хуже, чем его отсутствие. Заодно это отсекает почти все холостые
 * обращения к модели: у кого нет трёх дней, тому и рассказывать нечего.
 */
export const MIN_DAYS_FOR_INSIGHT = 3;

export function canAnalyze(facts: Pick<InsightFacts, "daysLogged">): boolean {
  return facts.daysLogged >= MIN_DAYS_FOR_INSIGHT;
}

export function buildInsightFacts(input: {
  periodLabel: string;
  daysInPeriod: number;
  dayStats: DayStat[];
  targets: Targets | null;
  frequentDishes: Array<{ name: string; times: number }>;
  weightChangeKg: number | null;
  showCalories: boolean;
}): InsightFacts {
  const days = input.dayStats;
  const avg = (pick: (day: DayStat) => number) =>
    days.length === 0 ? null : Math.round(days.reduce((sum, day) => sum + pick(day), 0) / days.length);
  const kcals = days.map((day) => day.kcal);

  return {
    periodLabel: input.periodLabel,
    daysInPeriod: input.daysInPeriod,
    daysLogged: days.length,
    avgKcal: avg((day) => day.kcal),
    avgProtein: avg((day) => day.protein),
    avgFiber: avg((day) => day.fiber),
    targetKcal: input.targets?.kcalTarget ?? null,
    targetProtein: input.targets?.proteinTarget ?? null,
    targetFiber: input.targets?.fiberTarget ?? null,
    minKcal: kcals.length > 0 ? Math.min(...kcals) : null,
    maxKcal: kcals.length > 0 ? Math.max(...kcals) : null,
    // Пять хватает: список длиннее человек не читает, а модели он даёт
    // ровно то же представление о рационе.
    frequentDishes: input.frequentDishes.slice(0, 5),
    weightChangeKg: input.weightChangeKg,
    showCalories: input.showCalories,
  };
}

/** Что модель обязана вернуть. Строго, потому что это идёт человеку в письмо. */
export type Insight = {
  /** Два-три предложения: что видно за период. Без оценок и без советов. */
  observation: string;
  /** На какие блюда посмотреть и почему. Пусто — тоже нормальный ответ. */
  dishNotes: string[];
};

export const INSIGHT_SCHEMA = {
  type: "object",
  properties: {
    observation: { type: "string", maxLength: 420 },
    dishNotes: {
      type: "array",
      maxItems: 3,
      items: { type: "string", maxLength: 180 },
    },
  },
  required: ["observation", "dishNotes"],
  additionalProperties: false,
} as const;

/**
 * Проверка ответа. Пустой разбор — законный исход, а вот выдуманное число в
 * тексте — нет, и поймать его здесь нечем: числа мы модели дали сами, и
 * проверять их пересчётом значило бы писать второй разбор. Поэтому в запросе
 * прямо запрещено называть цифры, которых не было во входе, а здесь остаётся
 * длина и форма.
 */
export function validateInsight(raw: unknown): Insight {
  if (!raw || typeof raw !== "object") throw new Error("insight: ответ не объект");
  const value = raw as Record<string, unknown>;
  const observation = typeof value.observation === "string" ? value.observation.trim() : "";
  if (!observation) throw new Error("insight: пустое наблюдение");
  const notes = Array.isArray(value.dishNotes)
    ? value.dishNotes.filter((note): note is string => typeof note === "string" && note.trim().length > 0)
    : [];
  return { observation, dishNotes: notes.map((note) => note.trim()).slice(0, 3) };
}

/**
 * ## Привычки вокруг еды
 *
 * Вода, движение, шаги, алкоголь. Просили напоминать — напоминаем, но с одной
 * оговоркой, которая определяет всю форму этих строк: **мы ничего из этого не
 * измеряем**. Ни шагов, ни выпитой воды, ни тренировок.
 *
 * Значит, нельзя писать «вы мало ходили» или «вам не хватило воды» — это было
 * бы выдумкой о человеке, притворяющейся данными. Строки сформулированы как
 * общее напоминание, и по ним видно, что мы не подглядываем.
 *
 * Исключение одно — алкоголь: его видно в дневнике, если человек записал. Тут
 * мы имеем право сказать «был в записях», и только это; ни «много», ни
 * «стоит меньше» — оценка чужого выбора не наша работа.
 *
 * Чередование по номеру недели, а не случайно: один и тот же хвост каждую
 * неделю перестаёт читаться, а случайный порядок в отчёте, который приходит
 * по расписанию, выглядит как сбой.
 */
const HABIT_LINES = [
  "Вода — самое дешёвое, что можно добавить к любому рациону: полтора-два литра в день, "
    + "и половина вопросов к самочувствию снимается сама.",
  "Десять тысяч шагов — цифра круглая и условная, но как ориентир работает: это примерно "
    + "полтора часа обычной ходьбы за день, разнесённых по делам.",
  "Любое движение считается: лестница вместо лифта, остановка пешком, двадцать минут "
    + "на коврике. Дневник питания считает съеденное, а тратится оно ногами.",
  "Сон влияет на аппетит сильнее, чем кажется: после короткой ночи тянет на быстрые "
    + "углеводы, и это физиология, а не слабость.",
] as const;

export const ALCOHOL_LINE =
  "В записях за период был алкоголь. Ничего не советуем — просто напомним, что он "
  + "считается калориями наравне с едой и заметно поднимает аппетит к закуске.";

export function habitReminders(input: { periodIndex: number; hadAlcohol: boolean }): string[] {
  const lines = [HABIT_LINES[Math.abs(input.periodIndex) % HABIT_LINES.length]];
  if (input.hadAlcohol) lines.push(ALCOHOL_LINE);
  return lines;
}

/** Разбор и привычки — секциями отчёта. Пустые не создаются. */
export function insightSections(insight: Insight | null, habits: string[]): ReportSection[] {
  const sections: ReportSection[] = [];
  if (insight) {
    const text = insight.dishNotes.length > 0
      ? `${insight.observation}\n\n${insight.dishNotes.map((note) => `• ${note}`).join("\n")}`
      : insight.observation;
    sections.push({ title: "Что заметно", text });
  }
  if (habits.length > 0) {
    sections.push({ title: "Вокруг еды", text: habits.join("\n\n") });
  }
  return sections;
}
