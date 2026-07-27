"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession } from "@/lib/auth";
import { normalizeEmail } from "@/lib/email";
import { hashPassword, verifyPassword } from "@/lib/password";

export type AuthState = {
  status: "idle" | "invalid_email" | "weak_password" | "email_taken" | "wrong_credentials" | "error";
};

const MIN_PASSWORD_LENGTH = 8;

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!email) return { status: "invalid_email" };
  if (password.length < MIN_PASSWORD_LENGTH) return { status: "weak_password" };

  let userId: number;
  try {
    const inserted = await getDb()
      .insert(users)
      .values({ email, passwordHash: await hashPassword(password) })
      .onConflictDoNothing()
      .returning({ id: users.id });
    if (inserted.length === 0) return { status: "email_taken" };
    userId = inserted[0].id;
    await createSession(userId);
  } catch (error) {
    console.error("register failed", error);
    return { status: "error" };
  }
  redirect("/app");
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { status: "wrong_credentials" };

  try {
    const rows = await getDb()
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return { status: "wrong_credentials" };
    }
    await createSession(user.id);
  } catch (error) {
    console.error("login failed", error);
    return { status: "error" };
  }
  redirect("/app");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}
