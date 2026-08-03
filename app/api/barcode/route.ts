import { getCurrentUser } from "@/lib/auth";
import { BARCODE_ERRORS, lookupBarcode, saveBarcodeFromBody } from "@/lib/barcode-api";
import { confirmBarcode } from "@/lib/barcode-store";

/**
 * Штрихкоды в веб-кабинете. Начинка общая с Mini App (lib/barcode-api.ts) —
 * различается только способ узнать пользователя.
 *
 * Вход обязателен, хотя карточки общие: без него это была бы открытая точка
 * записи в справочник, которым пользуются все.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Нужно войти." }, { status: 401 });

  const code = new URL(request.url).searchParams.get("code") ?? "";
  const result = await lookupBarcode(code);
  if (!result) return Response.json({ error: BARCODE_ERRORS.invalid_code }, { status: 400 });
  return Response.json(result);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Нужно войти." }, { status: 401 });

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

  const result = await saveBarcodeFromBody(body, user.id);
  if (!result.ok) return Response.json({ error: BARCODE_ERRORS[result.reason] }, { status: 400 });
  return Response.json({ ok: true, created: result.created });
}
