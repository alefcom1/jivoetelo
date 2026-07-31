"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { userConsents, users } from "@/db/schema";
import { createSession, destroySession } from "@/lib/auth";
import { normalizeEmail } from "@/lib/email";
import { LEGAL_VERSION } from "@/lib/legal";
import { hashPassword, verifyPassword } from "@/lib/password";

export type AuthState = {
  status: "idle" | "invalid_email" | "weak_password" | "email_taken" | "no_consent" | "wrong_credentials" | "error";
  /**
   * Что человек уже ввёл. React после server action сбрасывает
   * неконтролируемую форму — без этого любая ошибка стирала бы адрес и обе
   * отметки согласия. Пароль сознательно не возвращаем.
   */
  email?: string;
  consentTerms?: boolean;
  consentAi?: boolean;
};

const MIN_PASSWORD_LENGTH = 8;

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const typedEmail = String(formData.get("email") ?? "");
  const consentTerms = formData.get("consent_terms") === "on";
  const consentAi = formData.get("consent_ai") === "on";
  const typed = { email: typedEmail, consentTerms, consentAi };

  const email = normalizeEmail(typedEmail);
  const password = String(formData.get("password") ?? "");
  if (!email) return { status: "invalid_email", ...typed };
  if (password.length < MIN_PASSWORD_LENGTH) return { status: "weak_password", ...typed };
  // Согласия проверяем на сервере, а не только атрибутом required: браузер
  // можно обойти, а обрабатывать данные без согласия нельзя.
  if (!consentTerms || !consentAi) return { status: "no_consent", ...typed };

  let userId: number;
  try {
    const inserted = await getDb()
      .insert(users)
      .values({ email, passwordHash: await hashPassword(password) })
      .onConflictDoNothing()
      .returning({ id: users.id });
    if (inserted.length === 0) return { status: "email_taken", ...typed };
    userId = inserted[0].id;
    // Фиксируем, на какую редакцию документов человек согласился: без этой
    // записи оператору нечего предъявить при проверке.
    await getDb().insert(userConsents).values([
      { userId, kind: "terms", version: LEGAL_VERSION, source: "web" },
      { userId, kind: "ai_processing", version: LEGAL_VERSION, source: "web" },
    ]);
    await createSession(userId);
  } catch (error) {
    console.error("register failed", error);
    return { status: "error", ...typed };
  }
  redirect("/app");
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const typedEmail = String(formData.get("email") ?? "");
  const email = normalizeEmail(typedEmail);
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { status: "wrong_credentials", email: typedEmail };

  try {
    const rows = await getDb()
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const user = rows[0];
    // Пароля может не быть вовсе — так у аккаунтов, заведённых в Mini App.
    // Тогда вход по паролю невозможен, и это не «неверный пароль», а
    // «этим способом сюда не входят». Сообщение при этом одно и то же:
    // разное подсказывало бы, каким способом заведён чужой аккаунт.
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return { status: "wrong_credentials", email: typedEmail };
    }
    await createSession(user.id);
  } catch (error) {
    console.error("login failed", error);
    return { status: "error", email: typedEmail };
  }
  redirect("/app");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}
