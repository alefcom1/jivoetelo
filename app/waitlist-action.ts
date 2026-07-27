"use server";

import { getDb } from "@/db";
import { waitlistSubscribers } from "@/db/schema";
import { normalizeEmail } from "@/lib/email";

export type WaitlistState = { status: "idle" | "success" | "invalid" | "error" };

export async function joinWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email) return { status: "invalid" };

  try {
    // Повторная подписка того же адреса не ошибка: молча считаем успехом,
    // чтобы не раскрывать, какие адреса уже есть в базе.
    await getDb().insert(waitlistSubscribers).values({ email }).onConflictDoNothing();
    return { status: "success" };
  } catch (error) {
    console.error("waitlist insert failed", error);
    return { status: "error" };
  }
}
