"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { profiles, weightEntries } from "@/db/schema";
import { getSuggestionProvider, type MealSuggestion, type SuggestionContext } from "@/lib/ai/suggest";
import { getCurrentUser } from "@/lib/auth";
import { isValidDay, localToday } from "@/lib/dates";
import type { Activity, Goal, SexForFormula } from "@/lib/targets";

const GOALS: Goal[] = ["lose", "maintain", "gain"];
const ACTIVITIES: Activity[] = ["sedentary", "light", "moderate", "high"];
const SEXES: SexForFormula[] = ["female", "male"];

export type ProfileState = { status: "idle" | "invalid" | "error" };

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const goal = String(formData.get("goal"));
  const sexForFormula = String(formData.get("sexForFormula"));
  const activity = String(formData.get("activity"));
  const birthYear = Number(formData.get("birthYear"));
  const heightCm = Number(formData.get("heightCm"));
  const weightKg = Number(formData.get("weightKg"));

  const currentYear = new Date().getFullYear();
  const valid =
    GOALS.includes(goal as Goal) &&
    SEXES.includes(sexForFormula as SexForFormula) &&
    ACTIVITIES.includes(activity as Activity) &&
    Number.isInteger(birthYear) && birthYear >= currentYear - 100 && birthYear <= currentYear - 14 &&
    Number.isFinite(heightCm) && heightCm >= 120 && heightCm <= 230 &&
    Number.isFinite(weightKg) && weightKg >= 30 && weightKg <= 300;
  if (!valid) return { status: "invalid" };

  try {
    const db = getDb();
    await db
      .insert(profiles)
      .values({ userId: user.id, goal, sexForFormula, birthYear, heightCm, activity, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { goal, sexForFormula, birthYear, heightCm, activity, updatedAt: new Date() },
      });
    await db
      .insert(weightEntries)
      .values({ userId: user.id, onDate: localToday(), weightKg })
      .onConflictDoUpdate({ target: [weightEntries.userId, weightEntries.onDate], set: { weightKg } });
  } catch (error) {
    console.error("saveProfile failed", error);
    return { status: "error" };
  }
  redirect("/app");
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

export async function suggestNextMeal(context: SuggestionContext): Promise<SuggestResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Контекст приходит с клиента только как подсказка отображения; числа
  // зажимаются в разумные пределы, чтобы промпт нельзя было испортить.
  const safeContext: SuggestionContext = {
    remainingKcal: Math.min(3000, Math.max(0, Math.round(Number(context.remainingKcal) || 0))),
    remainingProtein: Math.min(200, Math.max(0, Math.round(Number(context.remainingProtein) || 0))),
    remainingFiber: Math.min(60, Math.max(0, Math.round(Number(context.remainingFiber) || 0))),
    mealTypeLabel: ["Завтрак", "Обед", "Ужин", "Перекус"].includes(context.mealTypeLabel)
      ? context.mealTypeLabel
      : "Перекус",
    showCalories: user.showCalories,
  };

  try {
    const suggestions = await getSuggestionProvider().suggest(safeContext);
    return { ok: true, suggestions };
  } catch (error) {
    console.error("suggestNextMeal failed", error);
    return { ok: false, error: "Не получилось подобрать варианты. Попробуйте через минуту." };
  }
}
