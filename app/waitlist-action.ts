"use server";

import { getDb } from "@/db";
import { waitlistSubscribers } from "@/db/schema";
import { normalizeEmail } from "@/lib/email";
import { LEGAL_VERSION } from "@/lib/legal";

export type WaitlistState = {
  status: "idle" | "success" | "invalid" | "no_consent" | "error";
  /**
   * Введённые значения возвращаются вместе с ошибкой: React после server
   * action сбрасывает неконтролируемую форму, и без этого человек, забывший
   * отметить согласие, обнаружил бы пустое поле и вводил адрес заново.
   */
  email?: string;
  consent?: boolean;
};

export async function joinWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const typed = String(formData.get("email") ?? "");
  const consent = formData.get("consent") === "on";
  const email = normalizeEmail(typed);
  if (!email) return { status: "invalid", email: typed, consent };
  // Адрес — персональные данные, поэтому без согласия его не сохраняем даже
  // если браузер каким-то образом отправил форму без отметки.
  if (!consent) return { status: "no_consent", email: typed, consent };

  try {
    // Повторная подписка того же адреса не ошибка: молча считаем успехом,
    // чтобы не раскрывать, какие адреса уже есть в базе.
    await getDb()
      .insert(waitlistSubscribers)
      .values({ email, consentVersion: LEGAL_VERSION })
      .onConflictDoNothing();
    return { status: "success" };
  } catch (error) {
    console.error("waitlist insert failed", error);
    return { status: "error", email: typed, consent };
  }
}
