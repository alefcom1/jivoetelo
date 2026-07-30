import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { isPaceKey } from "@/lib/profile";
import { authorize } from "../../_auth";

/**
 * Сохраняет целевой вес и темп снижения. Только UPDATE: остальные поля
 * профиля (цель, рост, активность) обязательны в схеме, и без них строку
 * profiles создать нельзя — план сперва настраивается в /app/onboarding.
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

  const rawTarget = body.targetWeightKg;
  let targetWeightKg: number | null;
  if (rawTarget === null || rawTarget === undefined) {
    targetWeightKg = null;
  } else {
    const n = Number(rawTarget);
    if (!Number.isFinite(n) || n < 30 || n > 300) {
      return Response.json({ error: "Целевой вес должен быть от 30 до 300 кг." }, { status: 400 });
    }
    targetWeightKg = n;
  }

  const rawPace = body.pace;
  if (rawPace !== null && rawPace !== undefined && !isPaceKey(String(rawPace))) {
    return Response.json({ error: "Неизвестный темп." }, { status: 400 });
  }
  const pace = rawPace == null ? null : String(rawPace);

  const rows = await getDb()
    .update(profiles)
    .set({ targetWeightKg, pace, updatedAt: new Date() })
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
