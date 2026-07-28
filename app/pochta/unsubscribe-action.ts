"use server";

import { unsubscribeByToken } from "@/lib/email-subscribe";

export type UnsubscribeState = { status: "idle" | "done" | "unknown" | "error" };

export async function unsubscribe(_prev: UnsubscribeState, formData: FormData): Promise<UnsubscribeState> {
  const token = String(formData.get("token") ?? "");
  try {
    return { status: (await unsubscribeByToken(token)) ? "done" : "unknown" };
  } catch (error) {
    console.error("unsubscribe failed", error);
    return { status: "error" };
  }
}
