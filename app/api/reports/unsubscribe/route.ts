import { unsubscribeReportsByToken } from "@/lib/report-unsubscribe";

/**
 * Отписка от отчётов в один клик из почтового клиента (RFC 8058). Сюда
 * приходит POST от Gmail, Яндекс.Почты и им подобных — не от человека.
 *
 * Ответ одинаковый и для знакомого токена, и для чужого: подтверждать, что
 * токен существует, значит отвечать на вопрос, который никто не имеет права
 * задавать.
 *
 * GET здесь нет намеренно. Почтовые сканеры предзагружают ссылки из писем, и
 * отписка по GET случалась бы у людей, которые ни на что не нажимали. Человеку
 * адресована ссылка на настройки в теле письма: там можно не выключать всё, а
 * оставить, например, только месячный отчёт.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    await unsubscribeReportsByToken(token);
  } catch (error) {
    console.error("report one-click unsubscribe failed", error);
    return new Response("error", { status: 500 });
  }
  return new Response("ok");
}
