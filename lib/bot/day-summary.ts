/**
 * Итог дня для бота: «сколько уже съедено и сколько осталось».
 *
 * Раньше вечернее напоминание сообщало, что снимки не разобраны, — то есть
 * говорило о нашей работе, а не о его дне. Человек же хочет цифру, и ради
 * неё открывал приложение. Одна команда отвечает на тот же вопрос за секунду.
 *
 * Модуль чистый: собирает текст из уже посчитанных чисел. Сами числа берутся
 * тем же кодом, что и в приложении (lib/meals.ts, lib/targets.ts) — второй
 * «упрощённой сводки для бота» быть не должно, иначе бот и Mini App начнут
 * расходиться цифрами за один и тот же день, и веры не будет ни одному.
 */

import { escapeHtml } from "./markup.ts";
import { pluralRu } from "../plural.ts";
import type { NutritionTotals } from "../nutrition.ts";
import type { Targets } from "../targets.ts";

export type DaySummaryInput = {
  totals: NutritionTotals;
  targets: Targets | null;
  /** Сколько приёмов пищи записано — «ничего не записано» это отдельный ответ. */
  mealsCount: number;
  /** Неразобранные снимки: их энергия в итог ещё не вошла, и молчать об этом нельзя. */
  pendingPhotos: number;
  /**
   * Режим «скрыть калории» (users.show_calories). Тогда итог остаётся, но
   * без энергии: белок и клетчатка сами по себе осмысленны, а показать
   * калории тому, кто их выключил, — сломать единственную настройку, ради
   * которой человек и остался.
   */
  showCalories: boolean;
};

const MEAL_FORMS = ["приём", "приёма", "приёмов"] as const;
const PHOTO_FORMS = ["снимок", "снимка", "снимков"] as const;
const WAIT_FORMS = ["ждёт", "ждут", "ждут"] as const;

function round(value: number): number {
  return Math.round(value);
}

/**
 * Строка «съедено из коридора». Коридор, а не одна цифра, — по той же
 * причине, что и везде: формула даёт оценку, и «1420 из 1650» обещает
 * точность, которой нет.
 */
function energyLine(kcal: number, targets: Targets | null): string {
  const eaten = round(kcal);
  if (!targets) return `<b>${eaten}</b> ккал за день`;

  // Своя норма — точка, а не диапазон: её назвал человек или его врач, и
  // растягивать её в коридор значило бы приписать им то, чего они не говорили.
  // Отсюда и разные слова ниже: «середина коридора» у заданной вручную нормы
  // не значит ничего, коридора там нет.
  const manual = targets.source === "manual";
  const corridor = manual ? `${targets.kcalTarget}` : `${targets.kcalMin}–${targets.kcalMax}`;
  const mark = manual ? "вашей нормы" : "середины коридора";
  const left = targets.kcalTarget - eaten;
  const tail =
    left > 50 ? `\nОсталось около <b>${round(left)}</b> ккал до ${mark}.`
    : left < -50 ? `\n${manual ? "Норму" : "Середину коридора"} прошли на <b>${round(-left)}</b> ккал.`
    : `\nВы примерно на ${manual ? "своей норме" : "середине коридора"}.`;

  return `<b>${eaten}</b> из ${corridor} ккал${tail}`;
}

/**
 * Итог дня целиком. Возвращает готовый HTML — как и все тексты бота
 * (lib/bot/texts.ts), они уходят с `parse_mode: HTML`.
 */
export function daySummaryText(input: DaySummaryInput): string {
  const { totals, targets, mealsCount, pendingPhotos, showCalories } = input;

  if (mealsCount === 0 && pendingPhotos === 0) {
    return (
      "📋 <b>Сегодня записей пока нет.</b>\n\n" +
      "Пришлите фото еды — разберём, или откройте дневник и добавьте руками."
    );
  }

  const lines: string[] = ["📋 <b>Ваш день</b>"];

  if (showCalories) lines.push(energyLine(totals.kcal, targets));

  const protein = targets
    ? `Белок: <b>${round(totals.protein)}</b> из ${targets.proteinTarget} г`
    : `Белок: <b>${round(totals.protein)}</b> г`;
  const fiber = targets
    ? `Клетчатка: <b>${round(totals.fiber)}</b> из ${targets.fiberTarget} г`
    : `Клетчатка: <b>${round(totals.fiber)}</b> г`;
  lines.push(`${protein}\n${fiber}`);

  lines.push(
    mealsCount > 0
      ? `Записано ${mealsCount} ${pluralRu(mealsCount, MEAL_FORMS)}.`
      : "Ни одного приёма пищи пока не записано.",
  );

  // Неразобранные снимки меняют смысл всех чисел выше, поэтому строка о них
  // обязательна: без неё «1200 ккал» читается как итог дня, хотя это итог
  // половины дня.
  if (pendingPhotos > 0) {
    lines.push(
      `📸 ${pendingPhotos} ${pluralRu(pendingPhotos, PHOTO_FORMS)} ` +
        `${pluralRu(pendingPhotos, WAIT_FORMS)} разбора — их энергия сюда ещё не вошла.`,
    );
  }

  // Норма задана руками — говорим об этом прямо. Иначе человек, увидев не то
  // число, которое ждал, решит, что сервис считает неправильно.
  if (showCalories && targets?.source === "manual") {
    lines.push("<i>Норма задана вами в настройках, формула отключена.</i>");
  }

  return lines.join("\n\n");
}

/** Подтверждение записанного веса вместе со строкой тренда, если она есть. */
export function weightSavedText(weightKg: number, trendLine: string | null): string {
  const value = escapeHtml(formatWeight(weightKg));
  const head = `⚖️ <b>Записал: ${value} кг.</b>`;
  const tail = trendLine
    ? `\n\n${escapeHtml(trendLine)}`
    : "\n\nЧерез пару недель замеров появится тренд — по нему и уточняется норма.";
  return `${head}${tail}`;
}

/** «72,4» — с запятой, как на весах, и без лишнего нуля у целых. */
export function formatWeight(weightKg: number): string {
  return (Math.round(weightKg * 10) / 10).toFixed(1).replace(".0", "").replace(".", ",");
}
