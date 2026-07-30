import { getDb } from "@/db";
import { weightEntries } from "@/db/schema";
import { isValidDay, localToday } from "@/lib/dates";
import { authorize } from "../../_auth";

/** Новое измерение веса — та же логика, что addWeight в веб-версии (app/app/profile-actions.ts). */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const weightKg = Number(body.weightKg);
  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) {
    return Response.json({ error: "Вес должен быть от 30 до 300 кг." }, { status: 400 });
  }
  const onDate = isValidDay(body.onDate as string | undefined) ? (body.onDate as string) : localToday();

  await getDb()
    .insert(weightEntries)
    .values({ userId: auth.user.id, onDate, weightKg })
    .onConflictDoUpdate({ target: [weightEntries.userId, weightEntries.onDate], set: { weightKg } });

  return Response.json({ ok: true });
}
