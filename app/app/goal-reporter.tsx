"use client";

import { useEffect } from "react";
import { GOAL_MEAL_SAVED, GOAL_PLAN_SET, reachGoal } from "@/lib/goals";

/**
 * Отправляет цель Метрики после действия, завершившегося переходом.
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
 */
const GOALS: Record<string, string> = {
  meal: GOAL_MEAL_SAVED,
  plan: GOAL_PLAN_SET,
};

export function GoalReporter({ saved }: { saved?: string }) {
  useEffect(() => {
    if (!saved) return;
    const goal = GOALS[saved];
    if (goal) reachGoal(goal as Parameters<typeof reachGoal>[0]);

    const url = new URL(window.location.href);
    url.searchParams.delete("saved");
    window.history.replaceState(null, "", url.toString());
  }, [saved]);

  return null;
}
