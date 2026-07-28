import { getMealProvider, MealAnalysisError } from "@/lib/ai";
import { ALLOWED_PHOTO_TYPES, deletePhoto, MAX_PHOTO_BYTES, savePhoto } from "@/lib/storage";
import { authorize } from "../_auth";

const ANALYSIS_ERRORS: Record<string, string> = {
  refused: "Не получилось разобрать. Попробуйте описать еду текстом.",
  invalid_output: "Разбор не удался — попробуйте ещё раз или заполните вручную.",
  provider_error: "Сервис разбора сейчас недоступен. Попробуйте через минуту.",
};

export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const formData = await request.formData();
  const mode = String(formData.get("mode") ?? "text");
  let photoKey: string | null = null;

  try {
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
      const analysis = await getMealProvider().analyseMeal({
        kind: "photo",
        data,
        mediaType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        note,
      });
      return Response.json({ analysis, photoKey, sourceText: note ?? null });
    }

    const text = String(formData.get("text") ?? "").trim();
    if (text.length < 3) return Response.json({ error: "Опишите еду хотя бы парой слов." }, { status: 400 });
    const sourceText = text.slice(0, 1000);
    const analysis = await getMealProvider().analyseMeal({ kind: "text", text: sourceText });
    return Response.json({ analysis, photoKey: null, sourceText });
  } catch (error) {
    if (photoKey) await deletePhoto(photoKey).catch(() => {});
    if (error instanceof MealAnalysisError) {
      return Response.json({ error: ANALYSIS_ERRORS[error.reason] }, { status: 502 });
    }
    console.error("tg analyze failed", error);
    return Response.json({ error: ANALYSIS_ERRORS.provider_error }, { status: 500 });
  }
}
