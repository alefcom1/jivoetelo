"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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

export type RedeemState =
  | { status: "idle" }
  | { status: "ok"; days: number; until: string }
  | { status: "failed"; message: string };

/**
 * Погасить код доступа.
 *
 * Проверка формата и все причины отказа — в lib/vouchers.ts и
 * lib/vouchers-store.ts; здесь только обвязка формы. Пользователя достаём
 * заново: server action вызывается отдельным запросом, и доверять чему-либо
 * пришедшему с клиента нельзя.
 */
export async function redeemVoucherAction(_prev: RedeemState, formData: FormData): Promise<RedeemState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { redeemVoucher } = await import("@/lib/vouchers-store");
  // Длину режем до разбора: поле ограничено и на клиенте, но action
  // вызывается мимо формы, а тащить в нормализацию строку на мегабайт незачем.
  const result = await redeemVoucher(user.id, String(formData.get("code") ?? "").slice(0, 40));
  if (!result.ok) return { status: "failed", message: result.message };

  revalidatePath("/app/settings");
  const until = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .format(result.accessUntil);
  return { status: "ok", days: result.days, until };
}
