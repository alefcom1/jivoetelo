import { applyProposal, getReviewData } from "@/lib/review-data";
import { authorize } from "../_auth";

/** Недельный обзор: те же секции и то же предложение по плану, что в кабинете. */
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const data = await getReviewData(auth.user.id, auth.user.showCalories);
  return Response.json(data);
}

/**
 * Подтверждение предложенной поправки к плану.
 *
 * Тела у запроса нет намеренно: величину поправки пересчитывает сервер
 * (applyProposal), клиент только подтверждает. Приняв число от клиента, мы бы
 * позволили выставить любую цель по энергии — включая опасную.
 */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const applied = await applyProposal(auth.user.id, auth.user.showCalories);
  // null — предложения уже нет: пока экран был открыт, появился новый замер
  // веса и оно перестало быть актуальным. Это не ошибка, но и не «применили».
  return Response.json({ ok: true, applied });
}
