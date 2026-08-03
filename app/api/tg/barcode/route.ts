import { BARCODE_ERRORS, lookupBarcode, saveBarcodeFromBody } from "@/lib/barcode-api";
import { confirmBarcode } from "@/lib/barcode-store";
import { authorize } from "../_auth";

/**
 * Штрихкоды для Mini App. Тот же смысл, что у /api/barcode в вебе, —
 * различается только способ узнать пользователя.
 */
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const code = new URL(request.url).searchParams.get("code") ?? "";
  const result = await lookupBarcode(code);
  if (!result) return Response.json({ error: BARCODE_ERRORS.invalid_code }, { status: 400 });
  return Response.json(result);
}

/**
 * Завести карточку — или отметить, что существующей воспользовались как есть
 * (`action: "confirm"`).
 */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  if (body.action === "confirm") {
    await confirmBarcode(String(body.code ?? ""));
    return Response.json({ ok: true });
  }

  const result = await saveBarcodeFromBody(body, auth.user.id);
  if (!result.ok) return Response.json({ error: BARCODE_ERRORS[result.reason] }, { status: 400 });
  return Response.json({ ok: true, created: result.created });
}
