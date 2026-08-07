import { getTributeConfig, isPaidEvent, isRefundEvent, parseEvent, readSignature, verifySignature, daysForTariff, tariffFromEvent } from "@/lib/payments/tribute";
import { applyPayment, matchPayer, recordEvent } from "@/lib/payments/store";

/**
 * Уведомления Tribute об оплате.
 *
 * Адрес для кабинета Tribute: `https://jivoetelo.ru/api/payments/tribute`.
 *
 * ## Что здесь важно и неочевидно
 *
 * **Отвечаем 200 почти всегда.** Платёжные сервисы на неуспешный ответ шлют
 * повтор, и часто — с нарастающей частотой. Ответ «не понял событие» кодом
 * 500 превращает одно ненужное уведомление в поток. Поэтому 200 означает
 * «получили и разобрались, повторять не надо», а не «выдали доступ».
 * Исключение одно: неверная подпись. Там 401 — это единственный ответ,
 * который честно говорит отправителю, что дело в нём.
 *
 * **Ничего не выдаём по непроверенному уведомлению.** Открытый маршрут,
 * выдающий доступ по неподписанному телу, — это бесплатная раздача премиума
 * всякому, кто узнает адрес. Подпись проверяется до любых действий с базой.
 *
 * **Сохраняем всё.** Каждое уведомление ложится в `payment_events` вместе с
 * сырым телом и заголовками. Документация Tribute из нашей среды недоступна
 * (403), имена полей восстановлены по вторичным источникам — и первое
 * настоящее уведомление здесь и есть недостающая спецификация. Заодно это
 * ответ на вопрос «деньги пришли, а доступа нет»: видно, что именно приехало.
 *
 * **Платёж без человека — не ошибка.** Tribute посредник, и его покупатель не
 * обязан совпасть с нашим аккаунтом. Такой платёж записывается без
 * пользователя и ждёт привязки в админке. Терять деньги нельзя; выдавать
 * доступ наугад — тем более.
 */

/** Тело крупнее этого — не уведомление, а попытка забить нам базу. */
const MAX_BODY_BYTES = 64 * 1024;

/** Заголовки в журнал: только полезные. Токены туда попасть не должны. */
function safeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of headers.entries()) {
    if (name === "authorization" || name === "cookie") continue;
    out[name] = value.length > 300 ? `${value.slice(0, 300)}…` : value;
  }
  return out;
}

export async function POST(request: Request) {
  const config = getTributeConfig();
  if (!config) {
    console.error("[tribute] уведомление пришло, но приём оплаты не настроен");
    return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "too_large" }, { status: 413 });
  }

  const headers = safeHeaders(request.headers);
  const verified = verifySignature(rawBody, readSignature(request.headers), config.apiKey);

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    // Тело сохраняем строкой: неразбираемое уведомление тоже говорит о том,
    // что мы чего-то не знаем о формате.
    await recordEvent({
      provider: "tribute", verified, eventType: null, externalId: null,
      raw: { unparsed: rawBody.slice(0, 4000) }, headers,
      outcome: "ignored", note: "тело не разобралось как JSON",
    });
    return Response.json({ ok: true }, { status: 200 });
  }

  const event = parseEvent(body);

  if (!verified) {
    await recordEvent({
      provider: "tribute", verified: false, eventType: event.type || null,
      externalId: event.externalId, raw: body, headers,
      outcome: "bad_signature",
      note: "подпись не сошлась — доступ не выдан. Проверьте TRIBUTE_API_KEY и имя заголовка в этом событии",
    });
    return Response.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  if (!config.enabled) {
    // Ключи есть, PAYMENTS_ENABLED не выставлен. Событие сохраняем: это
    // ровно та проверка связи, ради которой такое состояние и существует.
    await recordEvent({
      provider: "tribute", verified: true, eventType: event.type || null,
      externalId: event.externalId, raw: body, headers,
      outcome: "disabled", note: "приём оплаты выключен (PAYMENTS_ENABLED)",
    });
    return Response.json({ ok: true, note: "payments disabled" }, { status: 200 });
  }

  if (isRefundEvent(event)) {
    // Возврат не отзывает доступ автоматически. Отобрать оплаченное у
    // человека, который, возможно, вернул деньги по ошибке или получил их
    // обратно за другой товар, — решение с последствиями, и принимать его
    // должен человек в админке, а не обработчик по строке в уведомлении.
    await recordEvent({
      provider: "tribute", verified: true, eventType: event.type,
      externalId: event.externalId, raw: body, headers,
      outcome: "ignored", note: "возврат — доступ снимается вручную в админке",
    });
    return Response.json({ ok: true }, { status: 200 });
  }

  if (!isPaidEvent(event) || !event.externalId) {
    await recordEvent({
      provider: "tribute", verified: true, eventType: event.type || null,
      externalId: event.externalId, raw: body, headers,
      outcome: "ignored",
      note: event.externalId ? "событие не об оплате" : "в событии нет идентификатора покупки",
    });
    return Response.json({ ok: true }, { status: 200 });
  }

  const tariff = tariffFromEvent(event);
  const days = daysForTariff(tariff);
  const match = await matchPayer(event, config.refSecret);

  const result = await applyPayment({
    provider: "tribute",
    externalId: event.externalId,
    sum: event.amountMinor !== null ? String(event.amountMinor) : "0",
    tariff,
    days,
    match,
    payload: body,
  });

  const note = result.outcome === "unmatched"
    ? (match
        ? "тариф не опознан по сумме и названию товара — привяжите вручную"
        : "плательщик не найден ни по метке, ни по Telegram, ни по почте")
    : null;

  await recordEvent({
    provider: "tribute", verified: true, eventType: event.type,
    externalId: event.externalId, raw: body, headers,
    outcome: result.outcome, note,
  });

  return Response.json({ ok: true }, { status: 200 });
}

/**
 * GET оставлен ради проверки адреса из кабинета Tribute: сервисы часто
 * «пингуют» обработчик перед сохранением. Ничего не делает и ничего не
 * рассказывает о настройках.
 */
export async function GET() {
  return Response.json({ ok: true, provider: "tribute" }, { status: 200 });
}
