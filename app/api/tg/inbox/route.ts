import { dismissItem, listPending } from "@/lib/inbox";
import { authorize } from "../_auth";

/**
 * Фото-инбокс для Mini App. Снимок приходит боту, а разбирается здесь же, в
 * Telegram, — не выходя в браузер, где сессии может и не быть.
 */
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const items = await listPending(auth.user.id);
  return Response.json({ items });
}

/** Отклонение снимка: строка остаётся следом, файл удаляется. */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id)) return Response.json({ error: "Некорректный запрос." }, { status: 400 });

  const dismissed = await dismissItem(auth.user.id, id);
  return Response.json({ ok: dismissed });
}
