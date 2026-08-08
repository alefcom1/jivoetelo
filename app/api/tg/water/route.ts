import { isValidDay, localToday } from "@/lib/dates";
import { MAX_ENTRY_ML, MIN_ENTRY_ML } from "@/lib/water-log";
import { addWater, getWaterDay, undoLastWater } from "@/lib/water-store";
import { authorize } from "../_auth";

/**
 * Записать выпитое.
 *
 * В ответ отдаём пересчитанный день целиком, а не `{ ok: true }`: карточка
 * рисует сумму, полосу и подпись, и после каждого нажатия ей всё равно нужны
 * свежие числа. Один ответ вместо «записали» + «а теперь перечитай».
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

  const ml = Number(body.ml);
  if (!Number.isFinite(ml) || ml < MIN_ENTRY_ML || ml > MAX_ENTRY_ML) {
    return Response.json({ error: `Объём должен быть от ${MIN_ENTRY_ML} до ${MAX_ENTRY_ML} мл.` }, { status: 400 });
  }

  const day = isValidDay(body.day as string | undefined) ? (body.day as string) : localToday();
  await addWater(auth.user.id, day, ml);
  return Response.json(await getWaterDay(auth.user.id, day));
}

/**
 * Отменить последнюю запись за день. Возвращает тот же день, что и POST, —
 * клиенту нужен один способ обновить карточку, а не два.
 */
export async function DELETE(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const raw = url.searchParams.get("day") ?? undefined;
  const day = isValidDay(raw) ? raw! : localToday();

  await undoLastWater(auth.user.id, day);
  return Response.json(await getWaterDay(auth.user.id, day));
}
