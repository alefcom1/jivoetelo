import type { CurrentUser } from "@/lib/auth";
import { resolveTelegramUser, TelegramAuthError } from "@/lib/telegram";

/**
 * Достаёт initData из заголовка и возвращает пользователя.
 * Ошибки приводятся к JSON-ответам с понятным для клиента `reason`.
 */
export async function authorize(request: Request): Promise<{ user: CurrentUser } | { response: Response }> {
  const initData = request.headers.get("x-telegram-init-data");
  if (!initData) {
    return { response: Response.json({ reason: "invalid_signature" }, { status: 401 }) };
  }
  try {
    return { user: await resolveTelegramUser(initData) };
  } catch (error) {
    if (error instanceof TelegramAuthError) {
      const status = error.reason === "not_configured" ? 503 : error.reason === "not_linked" ? 403 : 401;
      return { response: Response.json({ reason: error.reason }, { status }) };
    }
    console.error("telegram authorize failed", error);
    return { response: Response.json({ reason: "error" }, { status: 500 }) };
  }
}
