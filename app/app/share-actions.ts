"use server";

import { redirect } from "next/navigation";
import { awardByKey } from "@/lib/awards";
import { getCurrentUser } from "@/lib/auth";
import { ensureReferralCode } from "@/lib/referral-store";
import { awardText, inviteText } from "@/lib/share-text";

/**
 * Текст приглашения с личной ссылкой.
 *
 * Собирается на сервере по той же причине, по которой там собираются реплики
 * персонажа: он же уходит из Mini App, и две редакции одного сообщения
 * разошлись бы. Правило «наружу не уходит ни слова про вес» (lib/share-text.ts)
 * должно проверяться в одном месте, а не в двух клиентах.
 *
 * Код выдаётся здесь, при первом нажатии, а не всем заранее: у большинства он
 * так и не появится.
 */
export async function shareAward(awardKey?: string): Promise<string> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const code = await ensureReferralCode(user.id);
  const award = awardKey ? awardByKey(awardKey) : null;
  return award ? awardText(award.share, code) : inviteText(code);
}
