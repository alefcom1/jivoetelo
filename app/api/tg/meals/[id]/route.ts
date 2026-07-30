import { deleteMealForUser, getMealDetailForUser, normalizeMealItems, replaceMealItemsForUser } from "@/lib/meals";
import { authorize } from "../../_auth";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Один приём пищи целиком — для экрана правки в «Дневнике». */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Некорректный запрос." }, { status: 400 });

  const meal = await getMealDetailForUser(auth.user.id, id);
  if (!meal) return Response.json({ error: "Запись не найдена." }, { status: 404 });
  return Response.json(meal);
}

/** Правка порции и состава: заменяет позиции приёма пищи и, при необходимости, его тип. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Некорректный запрос." }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const items = normalizeMealItems(body.items);
  if (items.length === 0) return Response.json({ error: "Добавьте хотя бы одну позицию." }, { status: 400 });

  const updated = await replaceMealItemsForUser(auth.user.id, id, String(body.mealType ?? "other"), items);
  if (!updated) return Response.json({ error: "Запись не найдена." }, { status: 404 });
  return Response.json({ ok: true });
}

/** Удаление приёма пищи целиком, вместе с фото. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Некорректный запрос." }, { status: 400 });

  const deleted = await deleteMealForUser(auth.user.id, id);
  if (!deleted) return Response.json({ error: "Запись не найдена." }, { status: 404 });
  return Response.json({ ok: true });
}
