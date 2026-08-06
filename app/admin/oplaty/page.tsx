import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { listPaymentEvents, listPayments } from "@/lib/payments/store";
import { getTributeConfig } from "@/lib/payments/tribute";
import { tariffByKey } from "@/lib/paid";
import { AttachPayment } from "./attach";

/**
 * Оплаты: что пришло от Tribute и что с этим стало.
 *
 * Раздел устроен вокруг одного вопроса, который задают в жизни: «человек
 * заплатил, а доступа нет — почему?». Поэтому здесь не только список денег,
 * но и журнал уведомлений с сырыми телами: ответ на этот вопрос почти всегда
 * в том, чего мы в уведомлении не поняли.
 *
 * ## Почему сырые тела вообще показываются
 *
 * Документация Tribute из нашей среды недоступна (403), и имена полей в
 * разборе восстановлены по вторичным источникам. Первое настоящее уведомление
 * и есть недостающая спецификация: по нему видно и действительные имена
 * полей, и имя заголовка с подписью. Когда интеграция обкатается, блок можно
 * будет убрать — но не раньше.
 */
export const dynamic = "force-dynamic";

const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

const OUTCOME_LABELS: Record<string, string> = {
  applied: "доступ выдан",
  unmatched: "не привязан к человеку",
  duplicate: "повтор, пропущен",
  ignored: "не про оплату",
  bad_signature: "подпись не сошлась",
  disabled: "приём выключен",
};

const MATCHED_LABELS: Record<string, string> = {
  ref: "по метке в ссылке",
  telegram: "по Telegram",
  email: "по почте",
  manual: "вручную",
};

export default async function AdminPaymentsPage() {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const config = getTributeConfig();
  const [rows, events] = await Promise.all([listPayments(100), listPaymentEvents(30)]);
  const pending = rows.filter((row) => row.appliedAt === null);

  return <main className="adm-page">
    <section className="adm-section">
      <h2>Оплаты</h2>
      {/* Состояние настройки — первым делом. Половина вопросов «почему не
          приходит» отвечается здесь, без чтения логов. */}
      <div className="adm-tiles">
        <div className="adm-tile">
          <strong>{config ? (config.enabled ? "включён" : "выключен") : "не настроен"}</strong>
          <span>приём оплаты</span>
        </div>
        <div className="adm-tile"><strong>{rows.length}</strong><span>платежей всего</span></div>
        <div className="adm-tile"><strong>{pending.length}</strong><span>ждут разбора</span></div>
        <div className="adm-tile">
          <strong>{events.filter((event) => !event.verified).length}</strong>
          <span>уведомлений без подписи</span>
        </div>
      </div>
      {!config && <p className="adm-empty">
        Не заданы <code>TRIBUTE_API_KEY</code>, <code>TRIBUTE_LINK_MONTH</code> и <code>TRIBUTE_LINK_YEAR</code>.
        Пока их нет, кнопки оплаты не показываются нигде, а уведомления отклоняются.
      </p>}
      {config && !config.enabled && <p className="adm-empty">
        Ключи есть, но <code>PAYMENTS_ENABLED</code> не выставлен в <code>true</code>. Уведомления
        принимаются и записываются, доступ не выдаётся — это состояние для проверки связи.
      </p>}
    </section>

    {pending.length > 0 && <section className="adm-section">
      <h2>Ждут разбора</h2>
      <p className="adm-section-lead">
        Деньги пришли, а доступ не выдан: не нашёлся человек или не опознан тариф. Привязка выдаёт
        доступ сразу и записывается в журнал обращений.
      </p>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Когда</th><th>Сумма от Tribute</th><th>Тариф</th><th>Платёж</th><th>Кому засчитать</th></tr></thead>
          <tbody>
            {pending.map((row) => <tr key={row.id}>
              <td>{dateTimeFormat.format(row.createdAt)}</td>
              <td>{row.sum}</td>
              <td>{row.tariff ? (tariffByKey(row.tariff)?.label ?? row.tariff) : "—"}</td>
              <td><code>{row.externalId}</code></td>
              <td><AttachPayment paymentId={row.id} tariff={row.tariff} /></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}

    <section className="adm-section">
      <h2>Все платежи</h2>
      {rows.length === 0
        ? <p className="adm-empty">Платежей пока не было.</p>
        : <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr><th>Когда</th><th>Человек</th><th>Сумма от Tribute</th><th>Тариф</th><th>Как нашли</th><th>Доступ</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => <tr key={row.id}>
                  <td>{dateTimeFormat.format(row.createdAt)}</td>
                  <td>
                    {row.userId
                      ? <Link href={`/admin/users?id=${row.userId}`}>{row.email ?? `#${row.userId}`}</Link>
                      : <span className="adm-muted">не привязан</span>}
                  </td>
                  <td>{row.sum}</td>
                  <td>{row.tariff ? (tariffByKey(row.tariff)?.label ?? row.tariff) : "—"}</td>
                  <td>{row.matchedBy ? (MATCHED_LABELS[row.matchedBy] ?? row.matchedBy) : "—"}</td>
                  <td>{row.appliedAt ? dateTimeFormat.format(row.appliedAt) : <span className="adm-muted">нет</span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
    </section>

    <section className="adm-section">
      <h2>Уведомления от Tribute</h2>
      <p className="adm-section-lead">
        Последние тридцать, как пришли. Если платёж не дошёл — причина здесь. Тело первого
        настоящего уведомления заодно показывает действительные имена полей: разбор написан
        по вторичным источникам, потому что документация Tribute нам не отдаётся.
      </p>
      {events.length === 0
        ? <p className="adm-empty">Уведомлений не приходило. Адрес для кабинета Tribute: <code>https://jivoetelo.ru/api/payments/tribute</code></p>
        : <div className="adm-events">
            {events.map((event) => <details key={event.id}>
              <summary>
                {dateTimeFormat.format(event.createdAt)} · {event.eventType ?? "без типа"} ·{" "}
                <b>{OUTCOME_LABELS[event.outcome] ?? event.outcome}</b>
                {!event.verified && " · подпись не проверена"}
              </summary>
              {event.note && <p className="adm-muted">{event.note}</p>}
              <pre>{JSON.stringify(event.raw, null, 2)}</pre>
            </details>)}
          </div>}
    </section>
  </main>;
}
