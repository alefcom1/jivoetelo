// Данные экрана «Профиль» (Mini App v2): цели, последние измерения, темп
// снижения и настройки напоминаний — одним запросом, потому что экран
// открывается целиком, а не по частям.

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles, users, weightEntries } from "@/db/schema";
import { getBotPreferences } from "./bot/store.ts";
import { computePace, PACE_OPTIONS, type PaceKey, type PaceResult } from "./pace.ts";
import { DEFAULT_DIGEST_HOUR } from "./reminders.ts";
import {
  computeTdee,
  explainTargets,
  GOAL_LABELS,
  type Activity,
  type Goal,
  type SexForFormula,
  type TargetStep,
  type Targets,
} from "./targets.ts";

export type ProfileGoals = {
  goal: Goal;
  goalLabel: string;
  activity: Activity;
  sexForFormula: SexForFormula;
  birthYear: number;
  heightCm: number;
  targetWeightKg: number | null;
  pace: PaceKey;
  /** Своя норма вместо расчётной, если задана. NULL — считаем по формуле. */
  kcalOverride: number | null;
};

export type ProfileData = {
  /** null у аккаунта из Mini App — почты там нет и не требуется. */
  email: string | null;
  telegramLinked: boolean;
  goals: ProfileGoals | null;
  latestWeightKg: number | null;
  recentWeights: Array<{ onDate: string; weightKg: number }>;
  /**
   * Темп снижения веса из lib/pace.ts. Считается только для цели «lose» —
   * расчёт именно про снижение, для «поддержания» и «набора» он не имеет
   * смысла (см. комментарий в lib/pace.ts).
   */
  paceResult: PaceResult | null;
  /**
   * Норма и разбор, откуда она взялась. null, пока нет профиля или веса —
   * считать не из чего.
   *
   * Разбор едет вместе с числом намеренно: до него норма появлялась на
   * экране без единого слова о происхождении, и это было единственное
   * место в продукте, где мы просили верить на слово.
   */
  targets: { values: Targets; steps: TargetStep[] } | null;
  reminders: { remindersEnabled: boolean; digestHour: number; snoozedUntil: string | null };
};

export function isPaceKey(value: string | null | undefined): value is PaceKey {
  return PACE_OPTIONS.some((option) => option.key === value);
}

export async function getProfileData(userId: number): Promise<ProfileData> {
  const db = getDb();
  const [userRows, profileRows, weightRows, preferences] = await Promise.all([
    db.select({ email: users.email, telegramUserId: users.telegramUserId }).from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
    db
      .select({ onDate: weightEntries.onDate, weightKg: weightEntries.weightKg })
      .from(weightEntries)
      .where(eq(weightEntries.userId, userId))
      .orderBy(desc(weightEntries.onDate))
      .limit(10),
    getBotPreferences(userId),
  ]);

  const user = userRows[0];
  const profile = profileRows[0];
  const latestWeightKg = weightRows[0]?.weightKg ?? null;
  const pace: PaceKey = isPaceKey(profile?.pace) ? profile.pace : "moderate";

  const goals: ProfileGoals | null = profile
    ? {
        goal: profile.goal as Goal,
        goalLabel: GOAL_LABELS[profile.goal as Goal],
        activity: profile.activity as Activity,
        sexForFormula: profile.sexForFormula as SexForFormula,
        birthYear: profile.birthYear,
        heightCm: profile.heightCm,
        targetWeightKg: profile.targetWeightKg,
        pace,
        kcalOverride: profile.kcalOverride,
      }
    : null;

  let paceResult: PaceResult | null = null;
  if (profile && profile.goal === "lose" && latestWeightKg) {
    const tdeeKcal = computeTdee({
      sexForFormula: profile.sexForFormula as SexForFormula,
      birthYear: profile.birthYear,
      heightCm: profile.heightCm,
      weightKg: latestWeightKg,
      activity: profile.activity as Activity,
    });
    // Срок до цели считаем, только если целевой вес ниже текущего: иначе
    // «сколько сбросить» отрицательное, а это уже не про lib/pace.ts.
    const targetLossKg =
      profile.targetWeightKg && profile.targetWeightKg < latestWeightKg
        ? latestWeightKg - profile.targetWeightKg
        : undefined;
    paceResult = computePace({ weightKg: latestWeightKg, tdeeKcal, pace, targetLossKg });
  }

  // Норма считается здесь же, а не на клиенте: формула, нижние границы и
  // правило про несовершеннолетних — одно место на весь продукт, и Mini App
  // не должен знать о них ничего, кроме готового результата.
  const targets = profile && latestWeightKg
    ? (() => {
        const { targets: values, steps } = explainTargets({
          goal: profile.goal as Goal,
          sexForFormula: profile.sexForFormula as SexForFormula,
          birthYear: profile.birthYear,
          heightCm: profile.heightCm,
          weightKg: latestWeightKg,
          activity: profile.activity as Activity,
          adjustmentKcal: profile.kcalAdjustment,
          pace: isPaceKey(profile.pace) ? profile.pace : null,
          kcalOverride: profile.kcalOverride,
        });
        return { values, steps };
      })()
    : null;

  return {
    // Не подменяем отсутствие адреса пустой строкой: интерфейс должен уметь
    // сказать «вход через Telegram», а не показывать пустое место там, где
    // человек ждёт увидеть почту.
    email: user?.email ?? null,
    telegramLinked: !!user?.telegramUserId,
    goals,
    latestWeightKg,
    recentWeights: weightRows,
    paceResult,
    targets,
    reminders: {
      remindersEnabled: preferences?.remindersEnabled ?? true,
      digestHour: preferences?.digestHour ?? DEFAULT_DIGEST_HOUR,
      snoozedUntil: preferences?.snoozedUntil ? preferences.snoozedUntil.toISOString() : null,
    },
  };
}
