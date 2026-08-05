import { formatCode } from "@/lib/vouchers";
import { listVouchers, voucherSummary } from "@/lib/vouchers-store";
import { issueVouchersAction } from "../actions";

/**
 * Ваучеры: выдача и журнал.
 *
 * Журнал здесь не для отчётности, а потому что ваучер — это деньги. Вопрос
 * «кому мы выдали код, который сейчас погасили» возникает не в день выдачи,
 * и ответить на него по памяти нельзя. Поэтому строка живёт и после
 * погашения, и в ней всегда видно, кто погасил.
 */
export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

export default async function AdminVouchersPage() {
  const [rows, summary] = await Promise.all([listVouchers(200), voucherSummary()]);
  // Свежевыпущенные — те, что ещё никто не видел: их и надо скопировать.
  const fresh = rows.filter((row) => row.usedAt === null).slice(0, 20);

  return <main className="adm-page">
    <section className="adm-section">
      <h2>Выдать ваучеры</h2>
      <p className="adm-section-lead">
        Код продлевает платный доступ на указанный срок. Отсчёт идёт от текущего срока, если он ещё
        не вышел, — остаток не сгорает.
      </p>
      <form className="adm-voucher-form" action={issueVouchersAction}>
        <label>
          Дней
          <input name="days" type="number" min={1} max={3650} defaultValue={30} required />
        </label>
        <label>
          Сколько кодов
          {/* Сотня за раз — защита от опечатки в этом поле: тысяча кодов,
              выпущенных случайно, это тысяча живых ключей. */}
          <input name="count" type="number" min={1} max={100} defaultValue={1} required />
        </label>
        <label>
          Действует до
          <input name="expiresAt" type="date" />
        </label>
        <label className="adm-voucher-note">
          Пометка
          <input name="note" type="text" maxLength={200} placeholder="блогеру такому-то" />
        </label>
        <button className="black-button" type="submit">Выдать</button>
      </form>
    </section>

    {fresh.length > 0 && <section className="adm-section">
      <h2>Непогашенные</h2>
      <p className="adm-section-lead">Эти коды можно раздавать. Показаны группами по четыре — так их и диктуют.</p>
      <ul className="adm-codes">
        {fresh.map((row) => <li key={row.id}>
          <code>{formatCode(row.code)}</code>
          <span>{row.days} дн.{row.note ? ` · ${row.note}` : ""}</span>
        </li>)}
      </ul>
    </section>}

    <section className="adm-section">
      <h2>Журнал</h2>
      <div className="adm-tiles">
        <div className="adm-tile"><strong>{summary.issued}</strong><span>выдано</span></div>
        <div className="adm-tile"><strong>{summary.used}</strong><span>погашено</span></div>
        <div className="adm-tile"><strong>{summary.issued - summary.used}</strong><span>на руках</span></div>
      </div>
      {rows.length === 0
        ? <p className="adm-empty">Ваучеров пока нет.</p>
        : <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr><th>Код</th><th>Дней</th><th>Выдан</th><th>Действует до</th><th>Погашен</th><th>Пометка</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => <tr key={row.id}>
                  <td><code>{formatCode(row.code)}</code></td>
                  <td>{row.days}</td>
                  <td>{dateFormat.format(row.createdAt)}</td>
                  <td>{row.expiresAt ? dateFormat.format(row.expiresAt) : "бессрочно"}</td>
                  <td>{row.usedAt ? `${dateFormat.format(row.usedAt)} · ${row.usedByEmail ?? "без почты"}` : "—"}</td>
                  <td>{row.note ?? "—"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
    </section>
  </main>;
}
