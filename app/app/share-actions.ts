"use server";

import { redirect } from "next/navigation";
import { awardByKey } from "@/lib/awards";
import { getCurrentUser } from "@/lib/auth";
import { referralLink } from "@/lib/referral";
import { ensureReferralCode, invitedCount } from "@/lib/referral-store";
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

/**
 * Ссылка-приглашение и счётчик пришедших — для блока в настройках.
 *
 * Отдельно от `shareAward`, потому что там собирается готовый текст для
 * пересылки, а здесь нужна сама ссылка: в вебе её копируют в буфер, а не
 * отдают клиенту Telegram.
 *
 * Действием, а не данными страницы, сознательно. `ensureReferralCode` пишет
 * в базу при первом обращении, и вызвать её при отрисовке настроек значило бы
 * завести код каждому, кто просто зашёл посмотреть, что там. Код появляется,
 * когда человек нажал «Получить ссылку», — то есть когда он ему нужен.
 */
export async function inviteLink(): Promise<{ link: string; invited: number }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [code, invited] = await Promise.all([
    ensureReferralCode(user.id),
    invitedCount(user.id),
  ]);
  return { link: referralLink(code), invited };
}
