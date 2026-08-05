import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiUsage } from "@/db/schema";
import { localToday } from "./dates.ts";
import {
  estimateCostUsd,
  globalDailyBudgetUsd,
  MIN_INTERVAL_MS,
  PLAN_LIMITS,
  type AiOperation,
  type Plan,
  type QuotaDecision,
  type TokenUsage,
} from "./quota-policy.ts";

export * from "./quota-policy.ts";

/** Сколько операций каждого вида пользователь израсходовал сегодня. */
export async function getUsageToday(userId: number): Promise<Record<AiOperation, number>> {
  const rows = await getDb()
    .select({ kind: aiUsage.kind, count: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.onDate, localToday())))
    .groupBy(aiUsage.kind);

  const used: Record<AiOperation, number> = {
    analyze_photo: 0, analyze_text: 0, suggest: 0, read_scale: 0, transcribe: 0,
  };
  for (const row of rows) {
    if (row.kind in used) used[row.kind as AiOperation] = Number(row.count);
  }
  return used;
}

/**
 * Сколько сервис потратил на AI сегодня, USD (по всем пользователям).
 *
 * Группируем по операции, а не суммируем всё разом: операции обслуживают
 * разные модели с разницей в цене втрое-впятеро, и одна общая ставка
 * превращала бы предохранитель в фикцию.
 */
export async function spentTodayUsd(): Promise<number> {
  const rows = await getDb()
    .select({
      kind: aiUsage.kind,
      input: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::bigint`,
      output: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::bigint`,
    })
    .from(aiUsage)
    .where(eq(aiUsage.onDate, localToday()))
    .groupBy(aiUsage.kind);

  return rows.reduce(
    (total, row) =>
      total +
      estimateCostUsd(
        { inputTokens: Number(row.input ?? 0), outputTokens: Number(row.output ?? 0) },
        row.kind as AiOperation,
      ),
    0,
  );
}

/**
 * Проверяет, можно ли выполнить операцию. Порядок проверок: частота →
 * персональный дневной лимит → глобальный предохранитель по стоимости.
 */
export async function checkQuota(userId: number, plan: Plan, operation: AiOperation): Promise<QuotaDecision> {
  const limit = PLAN_LIMITS[plan][operation];

  const recent = await getDb()
    .select({ id: aiUsage.id })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.kind, operation),
        gte(aiUsage.createdAt, new Date(Date.now() - MIN_INTERVAL_MS)),
      ),
    )
    .limit(1);
  if (recent.length > 0) return { allowed: false, reason: "too_fast" };

  const used = (await getUsageToday(userId))[operation];
  if (used >= limit) return { allowed: false, reason: "daily_limit", used, limit, operation };

  if ((await spentTodayUsd()) >= globalDailyBudgetUsd()) {
    return { allowed: false, reason: "service_budget" };
  }

  return { allowed: true, used, limit };
}

/** Записывает факт обращения к AI. Ошибку записи не эскалируем: разбор уже сделан. */
export async function recordUsage(userId: number, operation: AiOperation, usage: TokenUsage): Promise<void> {
  try {
    await getDb().insert(aiUsage).values({
      userId,
      onDate: localToday(),
      kind: operation,
      inputTokens: Math.max(0, Math.round(usage.inputTokens)),
      outputTokens: Math.max(0, Math.round(usage.outputTokens)),
    });
  } catch (error) {
    console.error("recordUsage failed", error);
  }
}
