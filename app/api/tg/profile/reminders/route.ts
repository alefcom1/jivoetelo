import { upsertPreferences } from "@/lib/bot/store";
import { normalizeDigestHour, snoozeUntil } from "@/lib/reminders";
import { authorize } from "../../_auth";

/**
 * Настройки напоминаний бота. Два действия одной ручкой:
 * - «save» — включённость и час дайджеста, как в веб-настройках; явное
 *   сохранение снимает паузу, потому что человек только что сказал, чего хочет;
 * - «snooze» — та же пауза на три дня, что и кнопка в самом боте
 *   (lib/bot/handle-update.ts), только доступная и из интерфейса, не только из чата.
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

  if (body.action === "snooze") {
    await upsertPreferences(auth.user.id, { snoozedUntil: snoozeUntil(new Date()) });
    return Response.json({ ok: true });
  }

  await upsertPreferences(auth.user.id, {
    remindersEnabled: Boolean(body.remindersEnabled),
    digestHour: normalizeDigestHour(body.digestHour),
    snoozedUntil: null,
    // Отсутствие поля — не «выключить»: старый клиент, не знающий про весы,
    // не должен молча гасить чужую настройку. Поэтому трогаем её, только
    // когда она пришла явно.
    ...(typeof body.weighRemindersEnabled === "boolean"
      ? { weighRemindersEnabled: body.weighRemindersEnabled }
      : {}),
  });
  return Response.json({ ok: true });
}
