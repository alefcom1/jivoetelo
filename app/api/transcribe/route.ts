import { getCurrentUser } from "@/lib/auth";
import { checkQuota, quotaMessage, recordUsage } from "@/lib/quota";
import { getSpeechProvider, isAllowedAudioMime, MAX_AUDIO_BYTES, SPEECH_ERRORS, SpeechError } from "@/lib/speech";

/**
 * Расшифровка записи в веб-кабинете. То же самое, что /api/tg/transcribe, но
 * авторизация по сессии, а не по подписи Telegram.
 *
 * Обработчик запроса, а не серверный экшен: экшен принимает FormData, но
 * мегабайтный файл через него идёт тем же каналом, что и отправка формы, и
 * лимиты на размер тела там свои. Здесь предел виден и проверяется явно.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  // 401 вместо редиректа: это запрос из скрипта, а не переход по ссылке.
  if (!user) return Response.json({ error: "Нужно войти." }, { status: 401 });

  const decision = await checkQuota(user.id, user.plan, "transcribe");
  if (!decision.allowed) return Response.json({ error: quotaMessage(decision) }, { status: 429 });

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("audio");
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Запись не приложена." }, { status: 400 });
  }
  // Размер и тип — до чтения байтов в память: провайдер проверит их ещё раз,
  // но к тому моменту файл уже был бы прочитан целиком.
  if (file.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: SPEECH_ERRORS.too_large }, { status: 413 });
  }
  if (!isAllowedAudioMime(file.type)) {
    return Response.json({ error: SPEECH_ERRORS.unsupported_format }, { status: 415 });
  }

  try {
    const result = await getSpeechProvider().transcribe({
      data: Buffer.from(await file.arrayBuffer()),
      mime: file.type,
    });
    await recordUsage(user.id, "transcribe", { inputTokens: 0, outputTokens: 0 });
    return Response.json({ text: result.text });
  } catch (error) {
    if (error instanceof SpeechError) {
      const status = error.reason === "disabled" ? 503 : error.reason === "provider_error" ? 502 : 400;
      return Response.json({ error: SPEECH_ERRORS[error.reason] }, { status });
    }
    console.error("transcribe failed", error);
    return Response.json({ error: SPEECH_ERRORS.provider_error }, { status: 500 });
  }
}
