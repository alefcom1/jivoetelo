import { consumeLinkCode, TelegramAuthError, verifyInitData } from "@/lib/telegram";

/** Привязка аккаунта по одноразовому коду, полученному в веб-профиле. */
export async function POST(request: Request) {
  const initData = request.headers.get("x-telegram-init-data");
  if (!initData) return Response.json({ reason: "invalid_signature" }, { status: 401 });

  let telegramUserId: string;
  try {
    telegramUserId = verifyInitData(initData).telegramUserId;
  } catch (error) {
    if (error instanceof TelegramAuthError) {
      return Response.json({ reason: error.reason }, { status: error.reason === "not_configured" ? 503 : 401 });
    }
    return Response.json({ reason: "error" }, { status: 500 });
  }

  let code: unknown;
  try {
    ({ code } = await request.json());
  } catch {
    return Response.json({ reason: "bad_code" }, { status: 400 });
  }
  if (typeof code !== "string" || code.trim().length < 4) {
    return Response.json({ reason: "bad_code" }, { status: 400 });
  }

  const user = await consumeLinkCode(code, telegramUserId);
  if (!user) return Response.json({ reason: "bad_code" }, { status: 400 });
  return Response.json({ ok: true, email: user.email });
}
