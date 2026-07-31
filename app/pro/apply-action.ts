"use server";

import { getDb } from "@/db";
import { proApplications } from "@/db/schema";
import { LEGAL_VERSION } from "@/lib/legal";
import { validateApplication } from "@/lib/pro/application";

export type ProApplyState = {
  status: "idle" | "success" | "invalid_email" | "no_name" | "no_consent" | "error";
  /**
   * Введённые значения возвращаются вместе с ошибкой: React после server
   * action сбрасывает неконтролируемую форму, и без этого человек, забывший
   * отметить согласие, обнаружил бы пустое поле и вводил адрес заново.
   */
  email?: string;
  name?: string;
  specialization?: string;
  city?: string;
  clientsCount?: string;
  currentTools?: string;
  comment?: string;
  consent?: boolean;
};

export async function applyForPro(_prev: ProApplyState, formData: FormData): Promise<ProApplyState> {
  // Собираем данные из формы в объект для валидации.
  const input = {
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? ""),
    specialization: String(formData.get("specialization") ?? ""),
    city: String(formData.get("city") ?? ""),
    clientsCount: String(formData.get("clientsCount") ?? ""),
    currentTools: String(formData.get("currentTools") ?? ""),
    comment: String(formData.get("comment") ?? ""),
    consent: formData.get("consent") === "on",
  };

  // Проверяем и нормализуем через чистый модуль.
  const result = validateApplication(input);

  // Если валидация не прошла, возвращаем ошибку вместе с введёнными значениями.
  if (!result.ok) {
    return {
      status: result.error,
      email: input.email,
      name: input.name,
      specialization: input.specialization,
      city: input.city,
      clientsCount: input.clientsCount,
      currentTools: input.currentTools,
      comment: input.comment,
      consent: input.consent,
    };
  }

  // Валидация прошла. Пишем в базу.
  const fields = result.fields;

  try {
    // Повторная заявка с того же адреса пишется отдельной строкой, и это
    // осознанно: анкета — материал для кастдева, а второй заход обычно
    // означает, что человек что-то добавил или передумал. Уникального
    // индекса по email на таблице нет, поэтому и `onConflictDoNothing`
    // здесь не стоит: он был бы пустышкой, обещающей защиту, которой нет.
    await getDb()
      .insert(proApplications)
      .values({
        email: fields.email,
        name: fields.name,
        specialization: fields.specialization || null,
        city: fields.city || null,
        clientsCount: fields.clientsCount || null,
        currentTools: fields.currentTools || null,
        comment: fields.comment || null,
        consentVersion: LEGAL_VERSION,
      });

    return { status: "success" };
  } catch (error) {
    console.error("pro application insert failed", error);
    return {
      status: "error",
      email: input.email,
      name: input.name,
      specialization: input.specialization,
      city: input.city,
      clientsCount: input.clientsCount,
      currentTools: input.currentTools,
      comment: input.comment,
      consent: input.consent,
    };
  }
}
