import { getTributeConfig, daysForTariff, tariffFromEvent } from "@/lib/payments/tribute";
import { decideWebhook, safeHeaders } from "@/lib/payments/tribute-webhook";
import { applyPayment, matchPayer, recordEvent } from "@/lib/payments/store";

/**
 * Уведомления Tribute об оплате.
 *
 * Адрес для кабинета Tribute: `https://jivoetelo.ru/api/payments/tribute`.
 *
 * Решение о том, что делать с уведомлением, принимает
 * `lib/payments/tribute-webhook.ts` — чистой функцией, без базы. Здесь
 * остаётся только ввод-вывод: прочитать тело, записать событие, при нужде
 * продлить доступ. Разделение не ради красоты: спецификация Tribute
 * восстановлена по вторичным источникам (их вики отдаёт нам 403), и самый
 * вероятный отказ — несовпадение с настоящим форматом. Такой разбор нужен
 * покрытым тестами целиком, а с `applyPayment` внутри его не покрыть.
 *
 * ## Что здесь важно и неочевидно
 *
 * **Отвечаем 200 почти всегда.** Платёжные сервисы на неуспешный ответ шлют
 * повтор, часто с нарастающей частотой. Ответ «не понял событие» кодом 500
 * превращает одно ненужное уведомление в поток. 200 означает «получили и
 * разобрались, повторять не надо», а не «выдали доступ». Исключения два:
 * неверная подпись (401) и ненастроенный приём оплаты (503) — оба честно
 * говорят отправителю, что дело не в самом уведомлении.
 *
 * **Ничего не выдаём по непроверенному уведомлению.** Открытый маршрут,
 * выдающий доступ по неподписанному телу, — это бесплатная раздача премиума
 * всякому, кто узнает адрес. Подпись проверяется до любых действий с базой.
 *
 * **Сохраняем всё, включая отказы.** Каждое уведомление ложится в
 * `payment_events` вместе с сырым телом и заголовками, и первое настоящее
 * уведомление здесь и есть недостающая спецификация. Заодно это ответ на
 * вопрос «деньги пришли, а доступа нет»: видно, что именно приехало.
 *
 * **Платёж без человека — не ошибка.** Tribute посредник, и его покупатель не
 * обязан совпасть с нашим аккаунтом. Такой платёж записывается без
 * пользователя и ждёт привязки в админке. Терять деньги нельзя; выдавать
 * доступ наугад — тем более.
 */
export async function POST(request: Request) {
  const config = getTributeConfig();
  const rawBody = await request.text();
  const headers = safeHeaders(request.headers);
  const decision = decideWebhook(rawBody, request.headers, config);

  if (decision.kind === "record") {
    if (decision.record) {
      // Запись в журнал не имеет права отменить ответ: упавший Postgres не
      // должен превращаться для Tribute в «доставьте это ещё двадцать раз».
      await recordEvent({ provider: "tribute", ...decision.record, headers }).catch((error) => {
        console.error("[tribute] событие не записалось в журнал", error);
      });
    }
    if (decision.status >= 400) {
      console.error(`[tribute] ${decision.record?.outcome ?? decision.status}: ${decision.record?.note ?? ""}`);
    }
    return Response.json(decision.body, { status: decision.status });
  }

  const event = decision.event;
  const tariff = tariffFromEvent(event);
  const match = await matchPayer(event, config!.refSecret);

  const result = await applyPayment({
    provider: "tribute",
    externalId: event.externalId!,
    sum: event.amountMinor !== null ? String(event.amountMinor) : "0",
    tariff,
    days: daysForTariff(tariff),
    match,
    payload: JSON.parse(rawBody),
  });

  const note = result.outcome === "unmatched"
    ? (match
        ? "тариф не опознан по сумме и названию товара — привяжите вручную"
        : "плательщик не найден ни по метке, ни по Telegram, ни по почте")
    : null;

  await recordEvent({
    provider: "tribute", verified: true, eventType: event.type,
    externalId: event.externalId, raw: JSON.parse(rawBody), headers,
    outcome: result.outcome, note,
  });

  return Response.json({ ok: true }, { status: 200 });
}

/**
 * GET оставлен ради проверки адреса из кабинета Tribute: сервисы часто
 * «пингуют» обработчик перед сохранением. Секретов не выдаёт, но отвечает на
 * два вопроса, которые задают первыми, когда «оплата не работает».
 *
 * Полей именно два, и это исправление. Сначала здесь было одно `configured`,
 * и оно означало «ключи заданы» — а прочитано было как «всё настроено».
 * Владелец увидел `configured: true`, пошёл искать кнопку оплаты и не нашёл:
 * кнопки зависят от `PAYMENTS_ENABLED`, которого не было. Диагностика,
 * отвечающая на соседний вопрос вместо заданного, хуже её отсутствия —
 * отсутствие хотя бы честно.
 *
 * `configured` — есть ли ключи и ссылки: без них уведомления отвергаются
 * с 503. `enabled` — выдаётся ли доступ за оплату и рисуются ли кнопки.
 * Промежуточное состояние (`configured: true, enabled: false`) — рабочий
 * режим проверки связи, а не недонастройка: уведомления принимаются и
 * ложатся в админку, деньги при этом ничего не открывают.
 */
export async function GET() {
  const config = getTributeConfig();
  return Response.json(
    {
      ok: true,
      provider: "tribute",
      configured: config !== null,
      enabled: config?.enabled === true,
    },
    { status: 200 },
  );
}
