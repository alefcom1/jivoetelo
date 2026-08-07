import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { isHintKey } from "@/lib/first-run";
import { authorize } from "../_auth";

/**
 * Отметить объяснение первых шагов пройденным.
 *
 * Принимает список ключей, а не один: при каждой загрузке «Сегодня» клиент
 * досылает всё, что человек уже сделал сам, не увидев подсказки
 * (`passedByData`). Отдельный запрос на каждый ключ означал бы четыре
 * запроса подряд в первую же секунду.
 *
 * Добавление идёт объединением на стороне базы, а не чтением-и-записью:
 * между `SELECT` и `UPDATE` человек успевает закрыть подсказку на другом
 * устройстве, и одна из отметок пропала бы. Пропавшая отметка — это
 * подсказка, которая вернулась после того, как её закрыли.
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

  const raw = Array.isArray(body.hints) ? body.hints : [body.hint];
  // Неизвестные ключи молча отбрасываем: список шагов живёт в коде, и
  // отдавать наружу ошибку на устаревший клиент незачем — он всё равно
  // ничего с ней не сделает.
  const keys = [...new Set(raw.filter(isHintKey))];
  if (keys.length === 0) return Response.json({ ok: true, added: 0 });

  await getDb()
    .update(users)
    .set({
      // jsonb-массивы объединяем через SQL: to_jsonb от массива текста плюс
      // существующее значение, с отбрасыванием повторов.
      firstRunHints: sql`(
        SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
        FROM jsonb_array_elements_text(${users.firstRunHints} || ${JSON.stringify(keys)}::jsonb) AS value
      )`,
    })
    .where(eq(users.id, auth.user.id));

  return Response.json({ ok: true, added: keys.length });
}
