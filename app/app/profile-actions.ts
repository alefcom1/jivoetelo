"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { profiles, weightEntries } from "@/db/schema";
import { MealAnalysisError, SUGGEST_ERRORS } from "@/lib/ai";
import { getSuggestionProvider, type MealSuggestion, type SuggestionContext } from "@/lib/ai/suggest";
import { getCurrentUser } from "@/lib/auth";
import { isValidDay, localToday } from "@/lib/dates";
import { parseProfileForm } from "@/lib/onboarding";
import { getDiaryContext } from "@/lib/suggest-context";
import { checkQuota, quotaMessage, recordUsage } from "@/lib/quota";

export type ProfileState = { status: "idle" | "invalid" | "error" };

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Разбор и валидация — в lib/onboarding.ts (parseProfileForm), общие для
  // первого прохода онбординга и повторного («Изменить план» в настройках).
  // Здесь остаётся только обвязка вокруг БД.
  const parsed = parseProfileForm({
    goal: String(formData.get("goal")),
    sexForFormula: String(formData.get("sexForFormula")),
    activity: String(formData.get("activity")),
    birthYear: String(formData.get("birthYear")),
    heightCm: String(formData.get("heightCm")),
    weightKg: String(formData.get("weightKg")),
    pace: String(formData.get("pace") ?? ""),
  });
  if (!parsed) return { status: "invalid" };
  const { weightKg, ...profileFields } = parsed;

  try {
    const db = getDb();
    // kcalAdjustment сюда намеренно не входит: это накопленная адаптивная
    // поправка (раздел 14.2), её меняет только applyProposedAdjustment ниже.
    // profileFields — тип без этого поля (см. ProfileFormValues), поэтому
    // повторный проход онбординга («Изменить план») физически не может его
    // задеть, даже случайно при будущей правке этого файла.
    await db
      .insert(profiles)
      .values({ userId: user.id, ...profileFields, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { ...profileFields, updatedAt: new Date() },
      });
    await db
      .insert(weightEntries)
      .values({ userId: user.id, onDate: localToday(), weightKg })
      .onConflictDoUpdate({ target: [weightEntries.userId, weightEntries.onDate], set: { weightKg } });
  } catch (error) {
    console.error("saveProfile failed", error);
    return { status: "error" };
  }
  redirect("/app?saved=plan");
}

export type WeightState = { status: "idle" | "invalid" | "error" | "saved" };

export async function addWeight(_prev: WeightState, formData: FormData): Promise<WeightState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const weightKg = Number(formData.get("weightKg"));
  const onDateRaw = String(formData.get("onDate") ?? "");
  const onDate = isValidDay(onDateRaw) ? onDateRaw : localToday();
  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) return { status: "invalid" };

  try {
    await getDb()
      .insert(weightEntries)
      .values({ userId: user.id, onDate, weightKg })
      .onConflictDoUpdate({ target: [weightEntries.userId, weightEntries.onDate], set: { weightKg } });
  } catch (error) {
    console.error("addWeight failed", error);
    return { status: "error" };
  }
  revalidatePath("/app/weight");
  return { status: "saved" };
}

/**
 * Применяет предложенную адаптивную корректировку (раздел 14.2). Величина
 * пересчитывается на сервере — клиент лишь подтверждает предложение.
 */
export async function applyProposedAdjustment(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { getReviewData } = await import("./review/data");
  const { proposal } = await getReviewData(user.id, user.showCalories);
  if (proposal) {
    const rows = await getDb()
      .select({ kcalAdjustment: profiles.kcalAdjustment })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);
    const current = rows[0]?.kcalAdjustment ?? 0;
    const next = Math.min(450, Math.max(-450, current + proposal.deltaKcal));
    await getDb().update(profiles).set({ kcalAdjustment: next, updatedAt: new Date() }).where(eq(profiles.userId, user.id));
  }
  revalidatePath("/app/review");
  revalidatePath("/app");
}

export type SuggestResult = { ok: true; suggestions: MealSuggestion[] } | { ok: false; error: string };

/** Подпись приёма пищи → ключ, которым размечен дневник. */
const MEAL_TYPE_KEYS: Record<string, string> = {
  "Завтрак": "breakfast", "Обед": "lunch", "Ужин": "dinner", "Перекус": "snack",
};

/**
 * Что серверный экшен принимает от клиента. Намеренно уже, чем
 * SuggestionContext: названия блюд сюда не входят вовсе — они уходят прямо в
 * запрос к модели, и принимать их снаружи значило бы дать способ дописать в
 * запрос что угодно. Дневник читается на сервере.
 */
export type SuggestionHints = Pick<
  SuggestionContext,
  "remainingKcal" | "remainingProtein" | "remainingFiber" | "mealTypeLabel" | "round"
>;

export async function suggestNextMeal(context: SuggestionHints): Promise<SuggestResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Контекст приходит с клиента только как подсказка отображения; числа
  // зажимаются в разумные пределы, чтобы промпт нельзя было испортить.
  const safeContext: SuggestionContext = {
    remainingKcal: Math.min(3000, Math.max(0, Math.round(Number(context.remainingKcal) || 0))),
    remainingProtein: Math.min(200, Math.max(0, Math.round(Number(context.remainingProtein) || 0))),
    remainingFiber: Math.min(60, Math.max(0, Math.round(Number(context.remainingFiber) || 0))),
    // Потолки по жиру и углеводам клиент не присылает: в вебе подсказки
    // вызываются с экрана «Сегодня», где этих чисел на руках нет. Ноль здесь
    // означает «ограничения не заданы» — промпт тогда о них и не говорит.
    fatLeft: 0,
    carbsLeft: 0,
    mealTypeLabel: ["Завтрак", "Обед", "Ужин", "Перекус"].includes(context.mealTypeLabel)
      ? context.mealTypeLabel
      : "Перекус",
    // Номер захода — число, и им клиент может распоряжаться свободно: он
    // выбирает лишь одну из заготовленных на сервере формулировок.
    round: Math.min(99, Math.max(0, Math.round(Number(context.round) || 0))),
    showCalories: user.showCalories,
    // Названия блюд читаются из базы, а не берутся из аргумента: это
    // свободный текст, который уходит прямо в запрос к модели, и принять его
    // от клиента значило бы дать способ дописать в запрос что угодно.
    ...(await getDiaryContext(user.id, localToday(), MEAL_TYPE_KEYS[context.mealTypeLabel])),
  };

  const decision = await checkQuota(user.id, user.plan, "suggest");
  if (!decision.allowed) return { ok: false, error: quotaMessage(decision) };

  try {
    const result = await getSuggestionProvider().suggest(safeContext);
    await recordUsage(user.id, "suggest", result.usage);
    return { ok: true, suggestions: result.suggestions };
  } catch (error) {
    if (error instanceof MealAnalysisError && error.reason === "disabled") {
      return { ok: false, error: SUGGEST_ERRORS.disabled };
    }
    console.error("suggestNextMeal failed", error);
    return { ok: false, error: SUGGEST_ERRORS.failed };
  }
}
