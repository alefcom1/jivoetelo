import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Проверка живости для docker healthcheck и внешнего мониторинга.
 *
 * Отвечает 200 только если приложение действительно может работать: одна
 * дешёвая проверка соединения с базой. Ничего о себе не рассказывает —
 * версии, переменные окружения и состав окружения наружу не отдаём.
 */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("healthcheck failed", error);
    return Response.json({ status: "degraded" }, { status: 503 });
  }
}
