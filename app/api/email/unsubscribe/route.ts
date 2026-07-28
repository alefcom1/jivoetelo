import { unsubscribeByToken } from "@/lib/email-subscribe";

/**
 * Отписка в один клик из почтового клиента (RFC 8058). Сюда приходит POST от
 * Gmail, Яндекс.Почты и им подобных — не от человека, поэтому отвечаем просто
 * и всегда одинаково: расписываться о том, знаком ли нам токен, здесь не
 * перед кем.
 *
 * Ссылку для человека этот адрес не заменяет: она ведёт на /pochta/otpiska,
 * где есть кнопка и понятный результат.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    await unsubscribeByToken(token);
  } catch (error) {
    console.error("one-click unsubscribe failed", error);
    return new Response("error", { status: 500 });
  }
  return new Response("ok");
}
