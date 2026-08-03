"use client";

import { useEffect } from "react";
import {
  GOAL_DAY2_RETURN,
  GOAL_MEAL_SAVED,
  GOAL_PLAN_SET,
  GOAL_SIGNUP,
  GOAL_TELEGRAM_LINKED,
  GOAL_WEEK1_ACTIVE,
  reachGoal,
  reachGoalOnce,
  type Goal,
} from "@/lib/goals";

/**
 * Отправляет цели Метрики с первого экрана кабинета.
 *
 * Почему не прямо в серверном действии: цели Метрики отправляются из
 * браузера, а серверное действие живёт на сервере и заканчивается редиректом.
 * Поэтому действие оставляет метку в адресе (`?saved=meal`), а этот компонент
 * на странице назначения её читает.
 *
 * Метка из адреса убирается сразу после отправки — `replaceState`, без
 * перезагрузки. Иначе она осталась бы в истории, и цель сработала бы повторно
 * при возврате «назад» или обновлении страницы: отчёт показал бы больше
 * записей еды, чем их было.
 *
 * Остальные цели — не про действие, а про состояние: «второй день с
 * записями», «седьмой», «Telegram привязан». Их считает сервер и передаёт
 * сюда готовыми флагами, а отправляются они через `reachGoalOnce` — один раз
 * за всё время, а не при каждом заходе.
 */
const BY_MARK: Record<string, Goal> = {
  meal: GOAL_MEAL_SAVED,
  plan: GOAL_PLAN_SET,
  signup: GOAL_SIGNUP,
};

export function GoalReporter({
  saved,
  loggedDays = 0,
  telegramLinked = false,
}: {
  saved?: string;
  /** Сколько дней всего есть записи. Не длина серии — общее число дней. */
  loggedDays?: number;
  telegramLinked?: boolean;
}) {
  useEffect(() => {
    if (!saved) return;
    const goal = BY_MARK[saved];
    if (goal) reachGoal(goal);

    const url = new URL(window.location.href);
    url.searchParams.delete("saved");
    window.history.replaceState(null, "", url.toString());
  }, [saved]);

  useEffect(() => {
    // Порог «седьмой день» проверяем раньше второго: у человека, который
    // пришёл к нам уже с историей, обе цели должны уйти, и порядок отправки
    // роли не играет — но читать код проще сверху вниз по убыванию.
    if (loggedDays >= 7) reachGoalOnce(GOAL_WEEK1_ACTIVE);
    if (loggedDays >= 2) reachGoalOnce(GOAL_DAY2_RETURN);
    if (telegramLinked) reachGoalOnce(GOAL_TELEGRAM_LINKED);
  }, [loggedDays, telegramLinked]);

  return null;
}
