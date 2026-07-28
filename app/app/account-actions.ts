"use server";

import { redirect } from "next/navigation";
import { deleteAccount } from "@/lib/account";
import { destroySession, getCurrentUser } from "@/lib/auth";

export type DeleteAccountState = { status: "idle" | "not_confirmed" | "error" };

/**
 * Слово подтверждения: осознанное действие, а не случайный клик. Живёт здесь
 * как литерал, потому что модуль с "use server" может экспортировать только
 * асинхронные функции; в интерфейсе оно продублировано в danger-zone.tsx.
 */
const DELETE_CONFIRMATION = "УДАЛИТЬ";

export async function requestAccountDeletion(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const confirmation = String(formData.get("confirmation") ?? "").trim().toUpperCase();
  if (confirmation !== DELETE_CONFIRMATION) return { status: "not_confirmed" };

  try {
    await deleteAccount(user.id);
    // Сессия уже удалена каскадом вместе с пользователем; здесь убираем cookie,
    // чтобы браузер не носил мёртвый токен.
    await destroySession();
  } catch (error) {
    console.error("account deletion failed", error);
    return { status: "error" };
  }
  redirect("/?deleted=1");
}
