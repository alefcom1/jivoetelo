import { exportAccount } from "@/lib/account";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Выгрузка всех данных пользователя одним файлом (152-ФЗ, ст. 14).
 * Отдаём JSON: он читается человеком и импортируется машиной, а CSV не
 * вмещает вложенный состав приёмов пищи без потерь.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let data: Record<string, unknown>;
  try {
    data = await exportAccount(user.id);
  } catch (error) {
    console.error("account export failed", error);
    return new Response("Не получилось собрать выгрузку", { status: 500 });
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="jivoetelo-${date}.json"`,
      // Выгрузка содержит все данные человека — ни кэшей, ни промежуточных
      // копий на прокси быть не должно.
      "Cache-Control": "no-store",
    },
  });
}
