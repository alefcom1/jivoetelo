// Куда отправлять отчёты и что в них показывать.
//
// Модуль чистый: решение «каким каналом» зависит только от настройки человека
// и от того, какие каналы у него вообще есть. Ни базы, ни отправки.

import type { ReportKind } from "./report-period.ts";

export type ReportChannel = "email" | "telegram";

/**
 * `auto` — не «мы решим за вас», а «туда, где вы есть». Настройка по
 * умолчанию, и она сознательно не «оба сразу»: один и тот же отчёт, пришедший
 * и в почту, и в Telegram, читается как сбой рассылки, а не как забота.
 */
export type ChannelSetting = "auto" | "email" | "telegram" | "both" | "off";

export const CHANNEL_SETTINGS: readonly ChannelSetting[] = ["auto", "email", "telegram", "both", "off"];

export function isChannelSetting(value: unknown): value is ChannelSetting {
  return typeof value === "string" && (CHANNEL_SETTINGS as readonly string[]).includes(value);
}

export type ReportPreferences = {
  weekly: ChannelSetting;
  monthly: ChannelSetting;
  /**
   * Показывать ли в отчёте сами килограммы.
   *
   * Включено по умолчанию: человек, который взвешивается и ведёт дневник,
   * свой вес и так знает, а отчёт без чисел превращается в намёк. Выключатель
   * нужен тем, кому цифра на весах мешает, — и им же адресован режим без
   * калорий (`users.show_calories`). Тренд «−0,3 кг за неделю» остаётся: это
   * изменение, а не вес.
   */
  weightNumbers: boolean;
};

export const DEFAULT_REPORT_PREFERENCES: ReportPreferences = {
  weekly: "auto",
  monthly: "auto",
  weightNumbers: true,
};

export type AvailableChannels = {
  hasEmail: boolean;
  hasTelegram: boolean;
};

/**
 * Какими каналами уходит отчёт этого вида.
 *
 * Разное «авто» для недели и месяца — не прихоть. Недельный отчёт короткий и
 * читается на бегу, ему место там, где человек и так каждый день, то есть в
 * Telegram. Месячный длиннее, к нему возвращаются, и почта его хранит; в
 * ленте сообщений он утонет за сутки.
 */
export function resolveChannels(
  kind: ReportKind,
  prefs: ReportPreferences,
  available: AvailableChannels,
): ReportChannel[] {
  const setting = kind === "weekly" ? prefs.weekly : prefs.monthly;
  if (setting === "off") return [];

  const wanted: ReportChannel[] =
    setting === "both" ? ["telegram", "email"]
    : setting === "email" ? ["email"]
    : setting === "telegram" ? ["telegram"]
    // auto
    : kind === "weekly" ? ["telegram", "email"] : ["email", "telegram"];

  const possible = wanted.filter((channel) => (channel === "email" ? available.hasEmail : available.hasTelegram));
  // При «авто» список — это порядок предпочтения, а не набор: берём первый
  // доступный. При явном «оба» — действительно оба.
  return setting === "both" ? possible : possible.slice(0, 1);
}
