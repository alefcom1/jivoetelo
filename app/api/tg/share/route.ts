import { awardByKey } from "@/lib/awards";
import { ensureReferralCode, invitedCount } from "@/lib/referral-store";
import { awardText, inviteText } from "@/lib/share-text";
import { authorize } from "../_auth";

/**
 * Текст для пересылки другу — с личной ссылкой-приглашением.
 *
 * Код заводится здесь, а не при регистрации: у большинства он так и не
 * появится, а колонка, заполненная всем заранее, — это миграция по живой
 * таблице ради данных, которыми никто не пользуется.
 *
 * Собирать текст на клиенте нельзя по той же причине, по которой там не
 * собираются реплики персонажа: он ушёл бы наружу в двух редакциях — из веба
 * и из Mini App, — и правило «ни одного килограмма наружу» (lib/share-text.ts)
 * пришлось бы держать в двух местах.
 */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Пустое тело — обычное приглашение без повода.
  }

  const code = await ensureReferralCode(auth.user.id);
  const award = typeof body.award === "string" ? awardByKey(body.award) : null;

  return Response.json({
    text: award ? awardText(award.share, code) : inviteText(code),
    invited: await invitedCount(auth.user.id),
  });
}
