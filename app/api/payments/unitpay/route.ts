import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payments, users } from "@/db/schema";
import { getPaymentsConfig } from "@/lib/payments/config";
import { handlerError, handlerSuccess, parseHandlerRequest } from "@/lib/payments/unitpay";

/**
 * Обработчик платежей Unitpay (методы check / pay / error).
 *
 * Приём оплаты сейчас ВЫКЛЮЧЕН: все функции сервиса бесплатны. Маршрут
 * существует, чтобы включение сводилось к переменным окружения, а не к
 * написанию кода под давлением сроков. Пока PAYMENTS_ENABLED != true,
 * обработчик честно отвечает отказом и ничего не зачисляет.
 *
 * Ответы — в формате JSON-RPC, как ожидает Unitpay. См. docs/payments.md.
 */
export async function GET(request: Request) {
  const config = getPaymentsConfig();
  if (!config) {
    return Response.json(handlerError("Приём оплаты не настроен"), { status: 200 });
  }

  const url = new URL(request.url);
  const parsed = parseHandlerRequest(url.searchParams, config.secretKey);
  if (!parsed.ok) {
    // Подпись проверяется всегда, даже когда приём выключен: так мы не
    // логируем и не отвечаем ничего осмысленного на неподписанный шум.
    const message =
      parsed.reason === "bad_signature" ? "Некорректная цифровая подпись" : "Некорректный запрос";
    return Response.json(handlerError(message), { status: 200 });
  }

  if (!config.enabled) {
    return Response.json(handlerError("Приём оплаты временно недоступен"), { status: 200 });
  }

  const { method, unitpayId, account, sum, params } = parsed.request;
  const db = getDb();
  // Платёж записываем даже с неопознанным account (опечатка, старая ссылка,
  // тестовый запрос): деньги терять нельзя, привязку разберём вручную.
  const userId = await resolveUserId(account);

  try {
    // Идемпотентность: повторный CHECK/PAY с тем же unitpayId не должен
    // зачислять дважды — возвращаем результат предыдущего обращения.
    const existing = await db
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.externalId, unitpayId))
      .limit(1);

    if (method === "check") {
      if (existing.length === 0) {
        await db.insert(payments).values({
          externalId: unitpayId,
          userId,
          sum,
          status: "checked",
          payload: params,
        });
      }
      return Response.json(handlerSuccess("Платёж принят к обработке"), { status: 200 });
    }

    if (method === "pay") {
      if (existing[0]?.status === "paid") {
        return Response.json(handlerSuccess("Платёж уже учтён"), { status: 200 });
      }
      await db
        .insert(payments)
        .values({
          externalId: unitpayId,
          userId,
          sum,
          status: "paid",
          payload: params,
        })
        .onConflictDoUpdate({
          target: payments.externalId,
          set: { status: "paid", payload: params, updatedAt: new Date() },
        });
      // Здесь появится выдача тарифа, когда монетизацию включат.
      return Response.json(handlerSuccess("Платёж учтён"), { status: 200 });
    }

    // method === "error"
    await db
      .insert(payments)
      .values({
        externalId: unitpayId,
        userId,
        sum,
        status: "failed",
        payload: params,
      })
      .onConflictDoUpdate({
        target: payments.externalId,
        set: { status: "failed", payload: params, updatedAt: new Date() },
      });
    return Response.json(handlerSuccess("Ошибка платежа зафиксирована"), { status: 200 });
  } catch (error) {
    console.error("unitpay handler failed", error);
    return Response.json(handlerError("Внутренняя ошибка"), { status: 200 });
  }
}

/**
 * В account кладём id пользователя. Возвращаем его только если такой
 * пользователь существует — иначе null, чтобы не упереться во внешний ключ
 * и всё равно сохранить факт платежа.
 */
async function resolveUserId(account: string): Promise<number | null> {
  const id = Number(account);
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = await getDb().select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  return rows[0]?.id ?? null;
}
