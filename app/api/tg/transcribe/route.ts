import { accessOffer } from "@/lib/payments/access-links";
import { checkQuota, quotaMessage, recordUsage } from "@/lib/quota";
import { getSpeechProvider, isAllowedAudioMime, MAX_AUDIO_BYTES, SPEECH_ERRORS, SpeechError } from "@/lib/speech";
import { authorize } from "../_auth";

/**
 * Расшифровка записи из Mini App.
 *
 * Возвращает только текст: разбор еды остаётся отдельным шагом, тем же, что
 * и у набранного руками описания. Так человек видит расшифровку до того, как
 * она превратится в калории, — а распознавание ошибается.
 *
 * Лимит здесь настоящий, хоть расшифровка и идёт на своём сервере и денег не
 * стоит: точка приёма мегабайтных файлов, гоняющая по ним модель, без
 * ограничения частоты — это способ занять сервер целиком.
 */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const decision = await checkQuota(auth.user.id, auth.user.plan, "transcribe");
  if (!decision.allowed) {
    // Кнопка оплаты едет вместе с текстом: экран, показавший отказ, —
    // единственное место, где человек прямо сейчас готов заплатить.
    return Response.json(
      { error: quotaMessage(decision), access: accessOffer(decision, auth.user.id) },
      { status: 429 },
    );
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("audio");
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Запись не приложена." }, { status: 400 });
  }
  // Размер и тип проверяем до чтения байтов в память: провайдер проверит их
  // ещё раз, но к тому моменту файл уже был бы прочитан целиком.
  if (file.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: SPEECH_ERRORS.too_large }, { status: 413 });
  }
  if (!isAllowedAudioMime(file.type)) {
    return Response.json({ error: SPEECH_ERRORS.unsupported_format }, { status: 415 });
  }

  // Длительность сюда не передаём: её знает только клиент, а значит она
  // ничего не гарантирует. Настоящий предел здесь — размер файла, он же и
  // ограничивает длину записи. Запись обрывается по MAX_DURATION_SEC на самом
  // клиенте — это забота о человеке, а не проверка.
  try {
    const result = await getSpeechProvider().transcribe({
      data: Buffer.from(await file.arrayBuffer()),
      mime: file.type,
    });
    // Токенов у своей установки нет — счётчик здесь нужен только для лимита
    // частоты и дневного предела, и стоимость такой строки честно нулевая.
    await recordUsage(auth.user.id, "transcribe", { inputTokens: 0, outputTokens: 0 });
    return Response.json({ text: result.text });
  } catch (error) {
    if (error instanceof SpeechError) {
      // 503 у выключенной расшифровки, а не 502: это не сбой апстрима, а
      // осознанно недоступная возможность.
      const status = error.reason === "disabled" ? 503 : error.reason === "provider_error" ? 502 : 400;
      return Response.json({ error: SPEECH_ERRORS[error.reason] }, { status });
    }
    console.error("tg transcribe failed", error);
    return Response.json({ error: SPEECH_ERRORS.provider_error }, { status: 500 });
  }
}
