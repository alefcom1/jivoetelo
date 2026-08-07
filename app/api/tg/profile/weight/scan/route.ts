import { MealAnalysisError, SCALE_ERRORS } from "@/lib/ai";
import { getScaleProvider } from "@/lib/ai/scale";
import { accessOffer } from "@/lib/payments/access-links";
import { checkQuota, quotaMessage, recordUsage } from "@/lib/quota";
import { judgeReading } from "@/lib/scale-reading";
import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES } from "@/lib/storage";
import { getLatestWeightKg } from "@/lib/weight";
import { authorize } from "../../../_auth";

/**
 * Прочитать вес со снимка индикатора напольных весов.
 *
 * Замер не сохраняется: маршрут отвечает числом, которое подставляется в то
 * же поле, куда вес вводят руками, а записывает его человек той же кнопкой.
 * Почему именно так — в lib/scale-reading.ts: цена ошибки распознавания здесь
 * не «неверная строка в списке», а изменившийся план.
 *
 * Снимок в хранилище не кладётся. Разбор еды хранит фотографию потому, что её
 * показывают в записи и по ней потом проверяют состав; здесь нужно ровно одно
 * число, и после ответа снимок не нужен никому.
 */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const decision = await checkQuota(auth.user.id, auth.user.plan, "read_scale");
  if (!decision.allowed) {
    // Кнопка оплаты едет вместе с текстом: экран, показавший отказ, —
    // единственное место, где человек прямо сейчас готов заплатить.
    return Response.json(
      { error: quotaMessage(decision), access: accessOffer(decision, auth.user.id) },
      { status: 429 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Выберите фото весов." }, { status: 400 });
  }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return Response.json({ error: "Поддерживаются JPEG, PNG, WebP и GIF." }, { status: 400 });
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return Response.json({ error: "Фото больше 8 МБ — сделайте снимок поменьше." }, { status: 400 });
  }

  try {
    const data = Buffer.from(await file.arrayBuffer());
    const result = await getScaleProvider().readScale({
      kind: "photo",
      data,
      mediaType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
    });
    await recordUsage(auth.user.id, "read_scale", result.usage);

    const verdict = judgeReading(result.reading, await getLatestWeightKg(auth.user.id));
    if (verdict.kind === "rejected") {
      // 200, а не 4xx: запрос был правильный, а «не прочиталось» — это
      // нормальный исход распознавания, а не сбой. Экран показывает совет и
      // оставляет человека у поля ручного ввода.
      return Response.json({ ok: false, message: verdict.message });
    }
    return Response.json({ ok: true, weightKg: verdict.weightKg, warning: verdict.warning });
  } catch (error) {
    if (error instanceof MealAnalysisError) {
      const status = error.reason === "disabled" ? 503 : 502;
      return Response.json({ error: SCALE_ERRORS[error.reason] }, { status });
    }
    console.error("tg scale scan failed", error);
    return Response.json({ error: SCALE_ERRORS.provider_error }, { status: 500 });
  }
}
