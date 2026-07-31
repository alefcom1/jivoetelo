"use server";

import { randomBytes } from "node:crypto";
import { requireApprovedSpecialist } from "@/lib/pro/guard";
import { issueInvite } from "@/lib/pro/store";

export type InviteState =
  | { status: "idle" }
  | { status: "ready"; code: string; expiresAt: string }
  | { status: "denied" }
  | { status: "error" };

/**
 * Единственное действие этого кабинета. Специалист не редактирует ничего у
 * клиента — см. правило 5 в lib/pro/access.ts, — поэтому здесь нет и не
 * будет действий вроде «изменить объём доступа» или «удалить клиента»:
 * это решения клиента, а не специалиста.
 *
 * `requireApprovedSpecialist` вызывается заново, а не берётся из пропсов
 * формы: server action выполняется отдельным запросом, и доверять состоянию
 * страницы на момент рендера — значит доверять сессии, которая могла
 * закончиться минуту назад.
 */
export async function createInvite(_prev: InviteState, formData: FormData): Promise<InviteState> {
  void formData; // форма не содержит полей — приглашение ничем не параметризуется

  const specialist = await requireApprovedSpecialist();
  if (!specialist) return { status: "denied" };

  try {
    const { code, expiresAt } = await issueInvite(
      specialist.userId,
      new Date(),
      (n) => new Uint8Array(randomBytes(n)),
    );
    return { status: "ready", code, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    console.error("pro invite issue failed", error);
    return { status: "error" };
  }
}
