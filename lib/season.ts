/**
 * Срез месяц-к-месяцу: что менялось за три месяца, полгода, год.
 *
 * ## Зачем он есть
 *
 * Недельный обзор отвечает на вопрос «как прошла неделя», месячная статистика
 * — «сколько и когда я ем». Ни то, ни другое не отвечает на вопрос, который
 * появляется у человека на третьем месяце: изменилось ли хоть что-нибудь.
 * Отдельные недели для этого слишком шумные — вода, отпуск, болезнь дают
 * разброс больше, чем полугодовая разница.
 *
 * Этот модуль появился не сам по себе: за вехой «Три месяца» должно стоять
 * что-то настоящее. Награда, за которой ничего не открывается, — наклейка, а
 * лестница вех в lib/streak.ts построена на обратном обещании: каждая строка
 * там ссылается на модуль, который делает её правдой.
 *
 * ## Чего здесь нет
 *
 * Оценок. Ни «стало лучше», ни «вы сбавили темп»: месяц с двенадцатью
 * записями — не провал человека, а месяц с двенадцатью записями. Причин тоже
 * нет: связать рост белка со снижением веса модуль не может и не пытается —
 * этим занимается lib/weight-response.ts, и там для этого есть статпроверка.
 *
 * Модуль чистый: ни базы, ни `new Date()`. Окно задаётся аргументом, как в
 * lib/meal-stats.ts и lib/adherence.ts.
 */

import { withPluralRu, type PluralForms } from "./plural.ts";

const DAY_FORMS: PluralForms = ["день", "дня", "дней"];

const MONTH_NAMES = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

/**
 * Те же месяцы в предложном падеже — для «в июне», «в августе».
 *
 * Отдельным списком, а не правилом: у русских месяцев форма предсказуемая
 * (кроме «в мае»), но правило на один исключающийся случай длиннее списка и
 * не читается. Заголовку колонки нужен именительный, строке наблюдения —
 * предложный, и подставлять именительный в «в …» нельзя: «в июнь» — не
 * опечатка, а фраза с другим смыслом.
 */
const MONTH_IN = [
  "январе", "феврале", "марте", "апреле", "мае", "июне",
  "июле", "августе", "сентябре", "октябре", "ноябре", "декабре",
];

/**
 * Сколько дней с записями делают месяц сравнимым.
 *
 * Восемь — примерно четверть месяца. Ниже этого среднее по дню начинает
 * зависеть от того, какие именно дни человек записал, а не от того, как он
 * ел: три записанных дня подряд в отпуске дадут картину отпуска, а не месяца.
 * Такие месяцы показываются, но в сравнение и в наблюдения не идут.
 */
export const MIN_MONTH_DAYS = 8;

/** Сколько сравнимых месяцев нужно, чтобы срез вообще имел смысл. */
export const MIN_MONTHS = 2;

export type SeasonDay = {
  /** Дата «ГГГГ-ММ-ДД». */
  day: string;
  meals: number;
  kcal: number;
  protein: number;
  fiber: number;
};

export type SeasonWeight = { day: string; weightKg: number };

export type SeasonMonth = {
  /** «ГГГГ-ММ» — ключ, по которому месяцы группируются. */
  month: string;
  /** «июнь 2026» — подпись для экрана. */
  label: string;
  loggedDays: number;
  /** Приёмов в день по дням С ЗАПИСЯМИ — как в lib/meal-stats.ts. */
  mealsPerDay: number | null;
  kcalPerDay: number | null;
  proteinPerDay: number | null;
  fiberPerDay: number | null;
  /** Средний вес за месяц. Среднее, а не последний замер: одна цифра — шум. */
  weightKg: number | null;
  /** Хватает ли записей, чтобы месяц можно было сравнивать. */
  comparable: boolean;
};

export type SeasonReport = {
  months: SeasonMonth[];
  /** Наблюдения словами. Пусто — нормальный и частый исход. */
  notes: string[];
  /** Сравнимых месяцев меньше MIN_MONTHS — сравнивать нечего. */
  enough: boolean;
};

/** Месяц даты: «2026-06-14» → «2026-06». */
function monthOf(day: string): string {
  return day.slice(0, 7);
}

function monthLabel(month: string): string {
  const [year, mm] = month.split("-");
  return `${MONTH_NAMES[Number(mm) - 1] ?? month} ${year}`;
}

/** «2026-06» → «июне»: форма для «в …». */
function monthIn(month: string): string {
  return MONTH_IN[Number(month.split("-")[1]) - 1] ?? month;
}

const round = (value: number, digits = 0): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * Собрать срез за последние `months` календарных месяцев, считая от `today`.
 *
 * Календарные месяцы, а не окна по 30 дней: человек думает «в июне» и «в
 * июле», а не «за дни с 12-го по 41-й». Неполный текущий месяц входит — он и
 * есть то, что происходит сейчас, — но сравнимым становится на общих
 * основаниях, по числу записанных дней.
 */
export function seasonReport(
  days: readonly SeasonDay[],
  weights: readonly SeasonWeight[],
  today: string,
  monthsBack: number,
): SeasonReport {
  const wanted = lastMonths(today, monthsBack);
  const wantedSet = new Set(wanted);

  const byMonth = new Map<string, SeasonDay[]>();
  for (const day of days) {
    const key = monthOf(day.day);
    if (!wantedSet.has(key)) continue;
    const list = byMonth.get(key) ?? [];
    list.push(day);
    byMonth.set(key, list);
  }

  const weightsByMonth = new Map<string, number[]>();
  for (const point of weights) {
    const key = monthOf(point.day);
    if (!wantedSet.has(key)) continue;
    const list = weightsByMonth.get(key) ?? [];
    list.push(point.weightKg);
    weightsByMonth.set(key, list);
  }

  const months: SeasonMonth[] = wanted.map((month) => {
    const logged = byMonth.get(month) ?? [];
    const weightPoints = weightsByMonth.get(month) ?? [];
    const n = logged.length;
    const avg = (pick: (d: SeasonDay) => number, digits = 0) =>
      n === 0 ? null : round(logged.reduce((sum, d) => sum + pick(d), 0) / n, digits);

    return {
      month,
      label: monthLabel(month),
      loggedDays: n,
      mealsPerDay: avg((d) => d.meals, 1),
      kcalPerDay: avg((d) => d.kcal),
      proteinPerDay: avg((d) => d.protein),
      fiberPerDay: avg((d) => d.fiber),
      weightKg: weightPoints.length === 0
        ? null
        : round(weightPoints.reduce((sum, w) => sum + w, 0) / weightPoints.length, 1),
      comparable: n >= MIN_MONTH_DAYS,
    };
  });

  const comparable = months.filter((m) => m.comparable);
  return {
    months,
    enough: comparable.length >= MIN_MONTHS,
    notes: comparable.length >= MIN_MONTHS ? observations(comparable) : [],
  };
}

/** Ключи последних `count` календарных месяцев, от старого к новому. */
export function lastMonths(today: string, count: number): string[] {
  const [year, month] = today.split("-").map(Number);
  const out: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    // Считаем в «месяцах от нулевого года» — так не нужно возиться с
    // переходом через декабрь, и календарь тут ни при чём.
    const total = year * 12 + (month - 1) - back;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Наблюдения словами: первый сравнимый месяц против последнего.
 *
 * Порог у каждого свой и не выдуман: ниже него разница — шум прибора или
 * округления, а не изменение. Формулировки описывают, а не хвалят: «дней с
 * записями стало больше» — факт, «вы стали дисциплинированнее» — оценка,
 * которой здесь не место.
 */
function observations(months: SeasonMonth[]): string[] {
  const first = months[0];
  const last = months[months.length - 1];
  if (first.month === last.month) return [];
  const notes: string[] = [];
  // Только название месяца, без года: год виден на самом экране, а в строке
  // «в июне 2026 против августа 2026» он читается как канцелярия.
  const was = monthIn(first.month);
  const now = monthIn(last.month);

  // Ритм записей. Пять дней — примерно неделя разницы за месяц.
  const daysDelta = last.loggedDays - first.loggedDays;
  if (Math.abs(daysDelta) >= 5) {
    notes.push(
      `Дней с записями ${daysDelta > 0 ? "стало больше" : "стало меньше"}: ` +
      `${withPluralRu(first.loggedDays, DAY_FORMS)} в ${was}, ${withPluralRu(last.loggedDays, DAY_FORMS)} в ${now}.`,
    );
  }

  // Белок: 10 г в день — заметная величина, меньше укладывается в погрешность
  // оценки состава по фото.
  addDelta(notes, first.proteinPerDay, last.proteinPerDay, 10, (from, to) =>
    `Белка в среднем за день: ${from} г в ${was}, ${to} г в ${now}.`);

  // Клетчатка: 4 г — примерно одно яблоко, ниже этого разница не про привычку.
  addDelta(notes, first.fiberPerDay, last.fiberPerDay, 4, (from, to) =>
    `Клетчатки в среднем за день: ${from} г в ${was}, ${to} г в ${now}.`);

  // Вес: 1 кг — за пределами суточных колебаний воды на месячном среднем.
  if (first.weightKg !== null && last.weightKg !== null && Math.abs(last.weightKg - first.weightKg) >= 1) {
    const delta = round(Math.abs(last.weightKg - first.weightKg), 1);
    notes.push(last.weightKg < first.weightKg
      ? `Средний вес за месяц: ${fmt(first.weightKg)} кг и ${fmt(last.weightKg)} кг — на ${fmt(delta)} кг ниже.`
      : `Средний вес за месяц: ${fmt(first.weightKg)} кг и ${fmt(last.weightKg)} кг — на ${fmt(delta)} кг выше.`);
  }

  return notes;
}

function addDelta(
  notes: string[],
  from: number | null,
  to: number | null,
  threshold: number,
  say: (from: number, to: number) => string,
): void {
  if (from === null || to === null) return;
  if (Math.abs(to - from) < threshold) return;
  notes.push(say(from, to));
}

/** Русская запись числа: десятые через запятую. */
function fmt(value: number): string {
  return String(round(value, 1)).replace(".", ",");
}
