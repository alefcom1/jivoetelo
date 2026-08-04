// Серии дней с записями. Механика знакомая по Duolingo, но её главный приём
// вывернут наизнанку — и это не украшение, а условие, при котором мы вообще
// имеем право её ставить.
//
// Классический стрик работает на страхе потери: чем длиннее число, тем дороже
// пропуск, и в какой-то момент человек ведёт дневник не ради себя, а ради
// цифры. Мы этот приём назвали анти-паттерном письменно (docs/market-research.md,
// раздел «Чего сознательно НЕ делаем») и пообещали, что серия не будет
// сгорать так, чтобы вызывать вину (docs/product-spec.md, 4.2).
//
// Поэтому здесь три числа вместо одного:
//
//   current     — серия. Хрупкая, как ей и положено: она и есть ежедневный
//                 повод открыть приложение.
//   totalDays   — все дни с записями за всё время. Не сбрасывается никогда.
//   caringWeeks — недели, где записей было хотя бы три дня. Ровно то, что
//                 обещано в market-research: пропуск не отменяет неделю.
//
// И главное: ВЕХИ ПРИВЯЗАНЫ К totalDays, А НЕ К СЕРИИ. Разборы открываются от
// количества дней с данными — статистике всё равно, шли они подряд или нет.
// Сказать «доведи серию до 14, и откроется “Еда и вес”» значило бы соврать:
// разбор откроется и при четырнадцати днях вразнобой. Из этого следует
// свойство, ради которого всё и затевалось — оборванная серия НИЧЕГО НЕ
// ОТНИМАЕТ. Число обнулилось, доступ остался, счётчик дней идёт дальше.
//
// Рекорда («лучшая серия») здесь сознательно нет. Он превращает собственное
// прошлое в недостижимую планку: чем выше рекорд, тем бессмысленнее выглядит
// текущая попытка. Для «я много чего уже сделал» есть totalDays, и он честнее.
//
// Модуль чистый: ни базы, ни `new Date()` внутри — `today` приходит
// аргументом, как в lib/adherence.ts и lib/reminders.ts.

import { isValidDay, shiftDay } from "./dates.ts";

/**
 * Заморозки — те самые пропуски, которые серию не рвут. Две в календарный
 * месяц: этого хватает на выходные в дороге и не хватает на «буду записывать
 * через день», а именно такой баланс и делает число осмысленным.
 *
 * Заморозка не покупается, не копится и не требует нажатия. Она применяется
 * молча и задним числом: человек открывает приложение после пропущенного дня
 * и видит, что серия цела, — а не диалог «потратить заморозку?», который
 * ставит его перед выбором ровно в тот момент, когда он и так виноватым себя
 * чувствует.
 */
export const MONTHLY_FREEZES = 2;

/**
 * Подряд заморозок — не больше двух. Три пропущенных дня подряд — это не
 * оступился, это уехал; делать вид, что серия не прерывалась, значит врать
 * человеку в лицо и обесценивать само число.
 */
export const MAX_CONSECUTIVE_FREEZES = 2;

/** Дней с записями в неделю, после которых неделя засчитана. */
export const CARING_WEEK_DAYS = 3;

/**
 * После стольких дней тишины енот засыпает. Смысл в том, чтобы вернувшемуся
 * через месяц не показывали бодрое «серия: 0» — это выглядит как упрёк.
 * Спящий енот не упрекает, он просто спит.
 */
export const SLEEP_AFTER_DAYS = 7;

/**
 * Настроение Живело. Не «награда» и не «наказание» — состояние, в котором
 * персонаж встречает человека.
 */
export type MascotMood =
  /** Сегодня уже записано. */
  | "happy"
  /** Записей сегодня ещё нет, но серия держится. */
  | "calm"
  /** Пропуск закрыт заморозкой — серия цела. */
  | "frozen"
  /** Серия оборвалась. Енот пропустил вместе с человеком, а не вместо него. */
  | "missed"
  /** Записей нет вовсе или их давно нет. */
  | "asleep";

export type Milestone = {
  /** Порог по totalDays — именно по нему, а не по серии. */
  days: number;
  title: string;
  /** Что на этом пороге реально открывается. Пустых вех у нас нет. */
  unlocks: string;
};

/**
 * Каждая веха — настоящий порог из кода, а не круглое число ради круглого
 * числа. Если порог в коде поменяется, поменять надо и здесь, иначе веха
 * начнёт обещать то, чего не даёт.
 */
export const MILESTONES: readonly Milestone[] = [
  // MIN_STATS_DAYS в lib/meal-stats.ts
  { days: 3, title: "Три дня", unlocks: "статистика приёмов пищи: сколько их и в какое время" },
  // MIN_ADHERENCE_DAYS в lib/adherence.ts
  { days: 7, title: "Неделя", unlocks: "приверженность по дням недели — виден собственный ритм" },
  // MIN_DAYS_LOGGED в lib/weight-response.ts
  { days: 14, title: "Две недели", unlocks: "раздел «Еда и вес»: первые наблюдения" },
  // Окно «месяц» в lib/meal-stats.ts
  { days: 30, title: "Месяц", unlocks: "месячная статистика и устойчивый тренд веса" },
  // MIN_PAIRS_STATISTICAL в lib/weight-response.ts
  { days: 60, title: "Два месяца", unlocks: "наблюдения по еде и весу проходят статистическую проверку" },
] as const;

export type StreakResult = {
  /** Дней подряд. Сегодняшний день входит, только если он уже записан. */
  current: number;
  /** Все дни с записями за всё время. Не обнуляется ни при каких условиях. */
  totalDays: number;
  /** Недель, где записей было CARING_WEEK_DAYS и больше. */
  caringWeeks: number;
  loggedToday: boolean;
  /** Дни текущей серии, закрытые заморозкой. Пустой массив — обычное дело. */
  frozenDays: string[];
  /** Сколько заморозок осталось до конца календарного месяца. */
  freezesLeft: number;
  mood: MascotMood;
  /** Ближайшая невзятая веха или null, если взяты все. */
  next: Milestone | null;
  /** Сколько дней с записями осталось до неё. */
  daysToNext: number | null;
  /** Веха, взятая ровно сегодня, — единственный повод поздравить. */
  reachedToday: Milestone | null;
};

/** Календарный месяц дня — ключ бюджета заморозок. */
function monthKey(day: string): string {
  return day.slice(0, 7);
}

/** Понедельник недели, в которую попадает день, — ключ «недели с заботой». */
function weekKey(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function countCaringWeeks(logged: Set<string>): number {
  const byWeek = new Map<string, number>();
  for (const day of logged) byWeek.set(weekKey(day), (byWeek.get(weekKey(day)) ?? 0) + 1);
  let weeks = 0;
  for (const count of byWeek.values()) if (count >= CARING_WEEK_DAYS) weeks += 1;
  return weeks;
}

/**
 * @param loggedDays Дни (YYYY-MM-DD) с хотя бы одной записью. Порядок и
 * дубликаты не важны — используется только факт. Один приём пищи делает день
 * записанным: порог «три приёма» превратил бы серию в требование к тому, как
 * человек ест, а она — про дневник.
 * @param today День, относительно которого всё считается.
 */
export function computeStreak(loggedDays: string[], today: string): StreakResult {
  const logged = new Set(loggedDays.filter(isValidDay));
  const totalDays = logged.size;
  const loggedToday = logged.has(today);

  const spent = new Map<string, number>();
  const frozenDays: string[] = [];
  // Заморозки, потраченные на хвост, за которым записей уже не нашлось. Такие
  // не считаются: закрывать пустоту в никуда незачем, и бюджет за неё
  // списывать тем более.
  let pending: string[] = [];
  let current = 0;
  let consecutiveFreezes = 0;

  // Сегодняшний день не пропуск, пока он не кончился: в девять утра человек
  // ещё не «пропустил» — он просто не успел.
  let day = loggedToday ? today : shiftDay(today, -1);

  for (;;) {
    if (logged.has(day)) {
      current += 1;
      frozenDays.push(...pending);
      pending = [];
      consecutiveFreezes = 0;
      day = shiftDay(day, -1);
      continue;
    }

    const key = monthKey(day);
    const used = spent.get(key) ?? 0;
    if (used >= MONTHLY_FREEZES || consecutiveFreezes >= MAX_CONSECUTIVE_FREEZES) break;

    spent.set(key, used + 1);
    consecutiveFreezes += 1;
    pending.push(day);
    day = shiftDay(day, -1);
  }

  // Незакрытый хвост бюджет не расходует.
  for (const unused of pending) {
    const key = monthKey(unused);
    spent.set(key, Math.max(0, (spent.get(key) ?? 0) - 1));
  }

  const freezesLeft = Math.max(0, MONTHLY_FREEZES - (spent.get(monthKey(today)) ?? 0));
  const lastLogged = totalDays > 0 ? [...logged].sort().at(-1)! : null;

  const next = MILESTONES.find((milestone) => milestone.days > totalDays) ?? null;
  const reachedToday = loggedToday
    ? MILESTONES.find((milestone) => milestone.days === totalDays) ?? null
    : null;

  return {
    current,
    totalDays,
    caringWeeks: countCaringWeeks(logged),
    loggedToday,
    frozenDays,
    freezesLeft,
    mood: moodFor({ totalDays, loggedToday, current, frozenDays, lastLogged, today }),
    next,
    daysToNext: next ? next.days - totalDays : null,
    reachedToday,
  };
}

function moodFor(input: {
  totalDays: number;
  loggedToday: boolean;
  current: number;
  frozenDays: string[];
  lastLogged: string | null;
  today: string;
}): MascotMood {
  // У новичка записей нет — но это не «давно молчит», это «ещё не начал».
  // Спящий енот на первом экране выглядел бы так, будто человек уже успел
  // что-то пропустить.
  if (input.totalDays === 0 || !input.lastLogged) return "calm";
  if (input.loggedToday) return "happy";
  if (daysBetween(input.lastLogged, input.today) > SLEEP_AFTER_DAYS) return "asleep";
  if (input.current === 0) return "missed";
  // Заморозка видна, только пока сегодняшний день пуст. Как только человек
  // записал сегодня, енот радуется и о заморозке молчит: она сделала своё
  // дело, напоминать о пропуске больше незачем.
  return input.frozenDays.length > 0 ? "frozen" : "calm";
}
