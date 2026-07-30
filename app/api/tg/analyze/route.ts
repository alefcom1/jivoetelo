import { ANALYSIS_ERRORS, getMealProvider, MealAnalysisError } from "@/lib/ai";
import { getPendingItem } from "@/lib/inbox";
import { checkQuota, quotaMessage, recordUsage } from "@/lib/quota";
import {
  ALLOWED_PHOTO_TYPES,
  deletePhoto,
  MAX_PHOTO_BYTES,
  photoMimeType,
  readPhoto,
  savePhoto,
} from "@/lib/storage";
import { authorize } from "../_auth";

export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const formData = await request.formData();
  const mode = String(formData.get("mode") ?? "text");

  // Все функции бесплатны; лимит защищает от неумеренного расхода токенов.
  const operation = mode === "text" ? "analyze_text" : "analyze_photo";
  const decision = await checkQuota(auth.user.id, auth.user.plan, operation);
  if (!decision.allowed) return Response.json({ error: quotaMessage(decision) }, { status: 429 });

  let photoKey: string | null = null;

  try {
    if (mode === "inbox") {
      // Снимок уже на диске: его прислали боту раньше. Заново загружать и
      // заново класть на диск нечего.
      const item = await getPendingItem(auth.user.id, Number(formData.get("inboxId")));
      if (!item) return Response.json({ error: "Этот снимок уже разобран или удалён." }, { status: 404 });
      const data = await readPhoto(item.photoKey);
      if (!data) return Response.json({ error: "Файл снимка не найден." }, { status: 404 });

      const result = await getMealProvider().analyseMeal({
        kind: "photo",
        data,
        mediaType: photoMimeType(item.photoKey) as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        note: item.note ?? undefined,
      });
      await recordUsage(auth.user.id, operation, result.usage);
      return Response.json({ analysis: result.analysis, photoKey: item.photoKey, sourceText: item.note });
    }

    if (mode === "photo") {
      const file = formData.get("photo");
      if (!(file instanceof File) || file.size === 0) {
        return Response.json({ error: "Выберите фото." }, { status: 400 });
      }
      if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        return Response.json({ error: "Поддерживаются JPEG, PNG, WebP и GIF." }, { status: 400 });
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return Response.json({ error: "Фото больше 8 МБ — сделайте снимок поменьше." }, { status: 400 });
      }
      const data = Buffer.from(await file.arrayBuffer());
      photoKey = await savePhoto(auth.user.id, data, file.type);
      const note = String(formData.get("note") ?? "").trim().slice(0, 300) || undefined;
      const result = await getMealProvider().analyseMeal({
        kind: "photo",
        data,
        mediaType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        note,
      });
      await recordUsage(auth.user.id, operation, result.usage);
      return Response.json({ analysis: result.analysis, photoKey, sourceText: note ?? null });
    }

    const text = String(formData.get("text") ?? "").trim();
    if (text.length < 3) return Response.json({ error: "Опишите еду хотя бы парой слов." }, { status: 400 });
    const sourceText = text.slice(0, 1000);
    const result = await getMealProvider().analyseMeal({ kind: "text", text: sourceText });
    await recordUsage(auth.user.id, operation, result.usage);
    return Response.json({ analysis: result.analysis, photoKey: null, sourceText });
  } catch (error) {
    if (photoKey) await deletePhoto(photoKey).catch(() => {});
    if (error instanceof MealAnalysisError) {
      // 503 у выключенного разбора, а не 502: это не сбой апстрима,
      // а осознанно недоступная возможность.
      const status = error.reason === "disabled" ? 503 : 502;
      return Response.json({ error: ANALYSIS_ERRORS[error.reason] }, { status });
    }
    console.error("tg analyze failed", error);
    return Response.json({ error: ANALYSIS_ERRORS.provider_error }, { status: 500 });
  }
}
