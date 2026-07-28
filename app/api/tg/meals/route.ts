import { localToday } from "@/lib/dates";
import { normalizeMealItems, saveMeal } from "@/lib/meals";
import { photoBelongsTo } from "@/lib/storage";
import { authorize } from "../_auth";

export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const items = normalizeMealItems(body.items);
  if (items.length === 0) return Response.json({ error: "Добавьте хотя бы одну позицию." }, { status: 400 });

  const eatenTime = typeof body.eatenTime === "string" && /^\d{2}:\d{2}$/.test(body.eatenTime)
    ? body.eatenTime
    : new Date().toISOString().slice(11, 16);
  const eatenOn = typeof body.eatenOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.eatenOn)
    ? body.eatenOn
    : localToday();
  const photoKey = typeof body.photoKey === "string" && photoBelongsTo(body.photoKey, auth.user.id)
    ? body.photoKey
    : null;

  try {
    const id = await saveMeal({
      userId: auth.user.id,
      eatenOn,
      eatenTime,
      mealType: String(body.mealType ?? "other"),
      sourceText: typeof body.sourceText === "string" ? body.sourceText : null,
      photoKey,
      analysis: body.analysis ?? null,
      items,
    });
    return Response.json({ ok: true, id });
  } catch (error) {
    console.error("tg saveMeal failed", error);
    return Response.json({ error: "Не получилось сохранить. Попробуйте ещё раз." }, { status: 500 });
  }
}
