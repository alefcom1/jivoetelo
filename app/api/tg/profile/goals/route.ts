import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { parseGoalsPatch } from "@/lib/onboarding";
import { authorize } from "../../_auth";

/**
 * Сохраняет план: цель, активность, рост, целевой вес, темп и свою норму.
 *
 * Только UPDATE. Пол и год рождения сюда не входят — это не настройки, а
 * факты, и менять их задним числом незачем; вес приходит отдельной записью в
 * дневник измерений. Строку profiles здесь тоже не создаём: первичная
 * настройка живёт в /app/onboarding, где спрашивают всё сразу.
 *
 * Раньше эндпоинт принимал только целевой вес и темп, а за целью, ростом и
 * активностью человека отправляли в веб-версию — то есть проходить онбординг
 * заново ради одного переключателя.
 */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const patch = parseGoalsPatch(body);
  if (!patch) {
    return Response.json({ error: "Проверьте цель, активность, рост и числа." }, { status: 400 });
  }

  const rows = await getDb()
    .update(profiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(profiles.userId, auth.user.id))
    .returning({ userId: profiles.userId });

  if (rows.length === 0) {
    return Response.json(
      { error: "Сначала настройте стартовый план в веб-версии.", reason: "no_profile" },
      { status: 409 },
    );
  }
  return Response.json({ ok: true });
}
