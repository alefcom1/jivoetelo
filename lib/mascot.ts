// Живело — енот, который живёт на главном экране и в напоминаниях бота.
//
// Зачем персонаж вообще. Числа серии («12 дней подряд») человек читает как
// оценку себя: сорвалось — значит, я плохо стараюсь. Персонаж между числом и
// человеком меняет адресата: пропустил не человек, а мы вдвоём. Это не приём
// ради умиления, это единственный способ показывать хрупкий счётчик и не
// нарушить обещание из docs/product-spec.md (4.2): серия не должна вызывать
// вину.
//
// Отсюда правило, которому подчинены все реплики ниже: НИКОГДА не «вы
// пропустили». Енот говорит про себя и про нас — «я вчера всё проспал»,
// «у нас с вами был выходной». Формально это то же событие; по ощущению —
// другое, и разница здесь и есть продукт.
//
// Второе правило: енот не хвалит за похудение и не расстраивается из-за веса.
// Он вообще про вес ничего не знает — только про то, была ли запись. Иначе
// получился бы персонаж, который радуется цифре на весах, а это ровно тот
// «celebratory messaging», который спека запрещает.
//
// Имя. В интерфейсе латиницей — Jivelo, как называется бот; в русском тексте
// склоняется как «Живело» (нескл. было бы неудобно: «серия Живело», «Живело
// прикрыл»). Оба написания живут здесь, чтобы не разъезжаться по файлам.

import { withPluralRu, type PluralForms } from "./plural.ts";
import type { MascotMood, StreakResult } from "./streak.ts";

/** Как персонаж подписан в интерфейсе — тем же словом, что и бот. */
export const MASCOT_NAME = "Jivelo";
/** Как он называется в русском тексте. Склоняется. */
export const MASCOT_NAME_RU = "Живело";

const DAY_FORMS: PluralForms = ["день", "дня", "дней"];
const FREEZE_FORMS: PluralForms = ["заморозка", "заморозки", "заморозок"];
const WEEK_FORMS: PluralForms = ["неделя", "недели", "недель"];

export type MascotSpeech = {
  mood: MascotMood;
  /** Крупная строка — состояние серии. */
  title: string;
  /** Мелкая строка — то, что енот говорит про это состояние. */
  note: string;
  /**
   * Подпись к взятой вехе или null. Появляется ровно в тот день, когда веха
   * взята, и говорит не «молодец», а что именно открылось.
   */
  milestone: string | null;
};

/** Описание для aria-label картинки — состояние словами, без эмоций напоказ. */
export const MOOD_LABELS: Record<MascotMood, string> = {
  happy: "Живело доволен",
  calm: "Живело ждёт",
  frozen: "Живело в заморозке",
  missed: "Живело загрустил",
  asleep: "Живело спит",
};

/**
 * Поза персонажа. Файлы лежат в public/mascot, режутся из листа спрайтов
 * скриптом scripts/cut-mascot.py — резать руками нельзя: хвосты и значки
 * заходят за границы клеток, и половина хвоста уезжает к соседу.
 *
 * Поз восемь, состояний серии пять, и соответствие не один в один: у взятой
 * вехи своя поза, ликующая, — это единственный момент, когда персонажу
 * позволено праздновать. Остальные три позы («?», «!», удивление) ждут своих
 * экранов и здесь не используются.
 */
export type MascotPose = "happy" | "cheer" | "calm" | "warm" | "sad" | "asleep" | "puzzled" | "surprised";

const POSE_BY_MOOD: Record<MascotMood, MascotPose> = {
  happy: "happy",
  calm: "calm",
  // Заморозка — не про холод, а про «я тебя прикрыл»: поза с сердечком, а не
  // с сугробом. Персонаж сделал одолжение, а не отморозился.
  frozen: "warm",
  missed: "sad",
  asleep: "asleep",
};

export function mascotPose(speech: MascotSpeech): MascotPose {
  return speech.milestone ? "cheer" : POSE_BY_MOOD[speech.mood];
}

export function mascotImage(pose: MascotPose): string {
  return `/mascot/${pose}.webp`;
}

function streakLine(days: number): string {
  return `${withPluralRu(days, DAY_FORMS)} подряд`;
}

/**
 * Что енот говорит при текущем состоянии серии. Функция чистая и
 * детерминированная: одинаковый вход — одинаковый текст. Случайных фраз
 * здесь нет намеренно — персонаж, который каждый раз шутит по-новому,
 * быстро надоедает, а тот, у кого на каждое состояние своя постоянная
 * реплика, читается как знакомый.
 */
export function mascotSpeech(streak: StreakResult): MascotSpeech {
  return {
    mood: streak.mood,
    title: titleFor(streak),
    note: noteFor(streak),
    milestone: streak.reachedToday ? `Открылось: ${streak.reachedToday.unlocks}.` : null,
  };
}

function titleFor(streak: StreakResult): string {
  if (streak.totalDays === 0) return `Привет, я ${MASCOT_NAME_RU}`;
  if (streak.mood === "asleep") return "Я тут подремал";
  if (streak.current === 0) return "Начинаем заново";
  return streakLine(streak.current);
}

function noteFor(streak: StreakResult): string {
  switch (streak.mood) {
    case "happy":
      return happyNote(streak);

    case "calm":
      // Новичок и тот, у кого серия жива с вечера, — разные люди, и говорить
      // с ними одинаково нельзя.
      return streak.totalDays === 0
        ? "Записывайте, что едите, — считать и вспоминать буду я."
        : "День ещё не записан. Не тороплю: вечером посчитаем вместе.";

    case "frozen":
      return (
        `Вчера у нас с вами был выходной — я прикрыл серию. ` +
        `До конца месяца ${withPluralRu(streak.freezesLeft, FREEZE_FORMS)}.`
      );

    case "missed":
      // Главная реплика всего модуля. Пропуск здесь — общий, а не адресный, и
      // сразу за ним идёт то, что никуда не делось.
      return `Я тоже всё проспал. ${totalLine(streak)} — это никуда не делось.`;

    case "asleep":
      return streak.totalDays > 0
        ? `${totalLine(streak)} у вас уже есть. Продолжим, когда будет удобно.`
        : "Разбудите меня первой записью.";
  }
}

function happyNote(streak: StreakResult): string {
  if (streak.next) {
    return `День записан. Ещё ${withPluralRu(streak.daysToNext ?? 0, DAY_FORMS)} — и откроется ${streak.next.unlocks}.`;
  }
  return `День записан. ${totalLine(streak)} — и все разборы уже открыты.`;
}

function totalLine(streak: StreakResult): string {
  const total = withPluralRu(streak.totalDays, DAY_FORMS);
  if (streak.caringWeeks === 0) return `${total} с записями`;
  return `${total} с записями и ${withPluralRu(streak.caringWeeks, WEEK_FORMS)} с заботой`;
}

/**
 * Строка для бота — тот же персонаж, но в одну строку и без заголовка.
 * Уходит с `parse_mode: HTML`, как и всё остальное, что говорит бот.
 *
 * Возвращает null, когда говорить не о чем: молчание — нормальный исход, и
 * право решать, писать ли вообще, остаётся за lib/reminders.ts. Здесь только
 * текст.
 */
export function mascotReminderLine(streak: StreakResult): string | null {
  if (streak.mood === "happy") return null;
  if (streak.reachedToday) return null;

  if (streak.mood === "frozen") {
    return `🦝 Вчерашний день я прикрыл — <b>${streakLine(streak.current)}</b> на месте.`;
  }
  if (streak.mood === "missed") {
    return `🦝 Серия сбилась, но ${totalLine(streak)} остались. Начнём заново сегодня?`;
  }
  if (streak.mood === "calm" && streak.current > 0) {
    return `🦝 <b>${streakLine(streak.current)}</b> — сегодняшний день ещё можно добавить.`;
  }
  return null;
}

/* ===================================================================
 * Поводы появиться, не связанные с серией
 * ===================================================================
 *
 * ## Зачем
 *
 * Первая версия персонажа жила ровно в одном месте — карточке серии на
 * «Сегодня». Человек видел его один раз за заход, и то если открывал первую
 * вкладку. Между тем самые частые минуты в приложении — это разбор снимка,
 * пустой дневник и сбой: именно там нужен голос, который объяснит, что
 * происходит, вместо системной строки.
 *
 * ## Чего здесь по-прежнему нельзя
 *
 * Правила из начала файла действуют и тут, и они важнее охвата:
 *
 *  - никакого «вы пропустили», «вы молодец», «слишком много»;
 *  - ни слова про вес — енот про него не знает и знать не должен;
 *  - на каждое состояние одна постоянная реплика, а не случайная шутка:
 *    персонаж, который каждый раз острит по-новому, надоедает за неделю.
 *
 * Отсюда же и то, чего здесь нет: поводов «съедено мало», «пора есть»,
 * «продержались без сладкого». Это оценки, и енот их не выносит.
 */

/** Уверенность разбора — та же шкала, что у позиций (lib/confidence.ts). */
type EventConfidence = "high" | "medium" | "low";

export type MascotEvent =
  /** Разбор снимка или текста закончен. */
  | { kind: "analyzed"; confidence: EventConfidence }
  /** Разбор не получился. */
  | { kind: "analysisFailed" }
  /** Самая первая запись человека. */
  | { kind: "firstEntry" }
  /** Вернулся после перерыва: столько-то дней без записей. */
  | { kind: "backAfterBreak"; daysAway: number }
  /** В дневнике за день пусто. */
  | { kind: "emptyDay" }
  /** Раздел или список пуст, потому что записей ещё нет вовсе. */
  | { kind: "nothingYet" }
  /** Разборов по ИИ осталось мало. */
  | { kind: "quotaLow"; left: number }
  /** Недельный обзор посчитан и готов. */
  | { kind: "weekReady" };

export type MascotLine = { pose: MascotPose; text: string };

/**
 * Что енот говорит по поводу.
 *
 * Возвращает null там, где ему сказать нечего: молчание — нормальный исход и
 * единственная защита от болтливости. Решать, показывать ли реплику вообще,
 * должен вызывающий экран — здесь только текст и поза.
 */
export function mascotEventLine(event: MascotEvent): MascotLine | null {
  switch (event.kind) {
    case "analyzed":
      // Три разных сообщения на три уверенности. Низкая — единственный
      // случай, когда енот просит вмешаться, и просит про граммы, а не
      // «проверьте, всё ли правильно».
      if (event.confidence === "high") return { pose: "happy", text: "Разобрал. Тут я уверен." };
      if (event.confidence === "medium") return { pose: "calm", text: "Разобрал. Граммы прикинул на глаз — поправьте, если знаете точнее." };
      return { pose: "puzzled", text: "Разобрал, но уверенности мало. Больше всего сомневаюсь в граммах." };

    case "analysisFailed":
      return { pose: "puzzled", text: "Не смог разобрать. Попробуем ещё раз или запишем руками?" };

    case "firstEntry":
      // Единственная веха, которую отмечает событие, а не серия: первая
      // запись — это про начало, а не про достижение.
      return { pose: "cheer", text: "Первая запись есть. Дальше будет проще — обещаю." };

    case "backAfterBreak":
      // Ни слова о пропуске. Только про то, что человек вернулся.
      if (event.daysAway < 3) return null;
      return {
        pose: "surprised",
        text: event.daysAway > 30
          ? "О, вы вернулись. Я всё это время тут сидел — начнём с сегодняшнего дня."
          : "С возвращением. Прошлые записи на месте, продолжим с сегодняшнего.",
      };

    case "emptyDay":
      return { pose: "calm", text: "За этот день записей нет. Можно добавить задним числом — я подожду." };

    case "nothingYet":
      return { pose: "asleep", text: "Пока пусто. Первая запись — и я проснусь." };

    case "quotaLow":
      if (event.left > 3) return null;
      return {
        pose: "puzzled",
        text: event.left === 0
          ? "Разборы на сегодня кончились. Руками записать по-прежнему можно."
          : `Разборов осталось ${withPluralRu(event.left, ["штука", "штуки", "штук"])}. Дальше — руками или завтра.`,
      };

    case "weekReady":
      return { pose: "happy", text: "Неделя посчитана. Смотреть стоит на неё, а не на отдельный день." };
  }
}
