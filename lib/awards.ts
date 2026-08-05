/**
 * Награды: чем сервис отмечает пройденное и что из этого можно показать другим.
 *
 * ## Что здесь считается достижением, а что нет
 *
 * Только факт наблюдения: сколько дней человек вёл дневник и сколько сделал
 * записей. Ни одного килограмма, ни одного «дня, закрытого точно в норму».
 *
 * Причина не в деликатности. Вес — не результат усилия, а результат десятка
 * вещей разом, и половина из них человеку неподвластна; сделать его счётом
 * значит наградить одних за конституцию, а других за неё же наказать. Кольцо
 * энергии мы прямо объясняем как «весь день, а не норма, которую надо
 * закрыть» (lib/first-run.ts) — награда за закрытое кольцо перечеркнула бы это
 * объяснение в одну строку.
 *
 * ## Награды не отзываются
 *
 * Ни одна не считается по текущей серии. Серия живая и прощающая — она уже
 * умеет замораживаться (lib/streak.ts), — а награда за неё превратилась бы в
 * то, что можно потерять, проболев неделю. Считаем по всем дням с записями и
 * по лучшей серии за всю историю: и то, и другое отнять невозможно.
 *
 * ## Отношение к вехам
 *
 * Вехи (MILESTONES в lib/streak.ts) — это то, что открывается в сервисе, и
 * они показываются один раз в день взятия. Награда — их долгая тень: список,
 * куда можно вернуться через месяц. Дублировать таблицу вех здесь нельзя,
 * поэтому награды по дням берутся оттуда.
 */

import { MILESTONES } from "./streak.ts";
import { withPluralRu, type PluralForms } from "./plural.ts";

const DAY_FORMS: PluralForms = ["день", "дня", "дней"];
const ENTRY_FORMS: PluralForms = ["запись", "записи", "записей"];

/** Состояние, по которому решается, что взято. Собирается вызывающей стороной. */
export type AwardState = {
  /** Все дни с записями за всё время. Не обнуляется ни при каких условиях. */
  totalDays: number;
  /** Всего приёмов пищи за всё время. */
  mealCount: number;
  /** Самая длинная серия за всю историю — уже случившееся, отнять нельзя. */
  bestStreak: number;
};

export type Award = {
  key: string;
  title: string;
  /** Что это значит — одной строкой, без похвалы. */
  note: string;
  /** Строка для карточки, которой делятся. */
  share: string;
};

type Rule = Award & { earned: (s: AwardState) => boolean };

/** Награды по дням — ровно те же рубежи, что у вех, и с их же обещаниями. */
const DAY_AWARDS: Rule[] = MILESTONES.map((milestone) => ({
  key: `days-${milestone.days}`,
  title: milestone.title,
  note: `${withPluralRu(milestone.days, DAY_FORMS)} с записями. Открылось: ${milestone.unlocks}.`,
  share: `${withPluralRu(milestone.days, DAY_FORMS)} наблюдений за своим питанием`,
  earned: (s) => s.totalDays >= milestone.days,
}));

/**
 * Награды не по дням.
 *
 * Записи и дни — разные вещи: можно вести дневник сто дней по одному приёму,
 * а можно тридцать дней подробно. Отмечать стоит и то, и другое, иначе второй
 * человек полгода не увидит ничего.
 */
const OTHER_AWARDS: Rule[] = [
  {
    key: "meals-100",
    title: "Сто записей",
    note: "Сто приёмов пищи в дневнике.",
    share: "100 записей о еде",
    earned: (s) => s.mealCount >= 100,
  },
  {
    key: "meals-500",
    title: "Пятьсот записей",
    note: "Пятьсот приёмов пищи в дневнике.",
    share: "500 записей о еде",
    earned: (s) => s.mealCount >= 500,
  },
  {
    key: "streak-7",
    title: "Неделя без пропусков",
    note: "Семь дней подряд с записями. Эта неделя уже случилась — отнять её нельзя.",
    share: "неделя дневника без единого пропуска",
    earned: (s) => s.bestStreak >= 7,
  },
  {
    key: "streak-30",
    title: "Месяц без пропусков",
    note: "Тридцать дней подряд с записями.",
    share: "месяц дневника без единого пропуска",
    earned: (s) => s.bestStreak >= 30,
  },
];

/**
 * Все награды в порядке показа: сначала по дням (лестница знакома по вехам),
 * потом остальные.
 */
const RULES: readonly Rule[] = [...DAY_AWARDS, ...OTHER_AWARDS];

/** Условие показа наружу не отдаём: снаружи оно не нужно и только соблазняло бы. */
const withoutRule = (rule: Rule): Award => ({ key: rule.key, title: rule.title, note: rule.note, share: rule.share });

export const AWARDS: readonly Award[] = RULES.map(withoutRule);

const BY_KEY = new Map(RULES.map((rule) => [rule.key, rule]));

/** Награда по ключу. `null` для неизвестного — ключи приходят из базы. */
export function awardByKey(key: string): Award | null {
  const rule = BY_KEY.get(key);
  return rule ? withoutRule(rule) : null;
}

/** Что взято при таком состоянии. Порядок — как в AWARDS. */
export function earnedAwards(state: AwardState): string[] {
  return RULES.filter((rule) => rule.earned(state)).map((rule) => rule.key);
}

/**
 * Что взято только что — то, чего ещё нет в базе.
 *
 * Отмечать надо всё разом, а показывать — одну (см. `freshest`): человек,
 * вернувшийся после долгого перерыва и записавший день, может пересечь сразу
 * три рубежа, и три поздравления подряд читаются как поток, а не как событие.
 */
export function newlyEarned(state: AwardState, stored: readonly string[]): string[] {
  const known = new Set(stored);
  return earnedAwards(state).filter((key) => !known.has(key));
}

/**
 * Какую из новых показать. Последняя по порядку — самая крупная: рубежи в
 * AWARDS идут по возрастанию, и «Три месяца» весомее «Недели», взятой в тот
 * же день.
 */
export function freshest(keys: readonly string[]): Award | null {
  const order = AWARDS.map((award) => award.key);
  let best: Award | null = null;
  let bestIndex = -1;
  for (const key of keys) {
    const index = order.indexOf(key);
    if (index > bestIndex) {
      bestIndex = index;
      best = awardByKey(key);
    }
  }
  return best;
}

/** Проверка ключа перед записью в базу: снаружи приходит строка. */
export function isAwardKey(value: unknown): value is string {
  return typeof value === "string" && BY_KEY.has(value);
}

/** Сколько записей — строкой, для подписей вида «412 записей». */
export function entriesWord(count: number): string {
  return withPluralRu(count, ENTRY_FORMS);
}
