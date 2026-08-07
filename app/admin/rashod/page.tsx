import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { aiSpendByDay, aiSpendByUser } from "@/lib/admin-stats";
import { AI_OPERATIONS, OPERATION_SHORT, type AiOperation } from "@/lib/quota-policy";

/**
 * Расход на распознавание: по дням и по людям.
 *
 * Отдельной страницей, а не блоком в обзоре. В обзоре расход стоял одним
 * итогом за тридцать дней — числом, которое отвечает «сколько стоит сервис
 * вообще» и не отвечает ни на один вопрос, возникающий в работе: когда
 * подскочило, разовый это выброс или новая норма, кто именно расходует.
 *
 * ## Почему цифры здесь не совпадут со счётом Anthropic
 *
 * Это оценка по прейскуранту, а не выписка. Расхождений три, и все они
 * известны заранее:
 *
 * 1. **Ставки списочные.** Скидки, кэш промпта и пакетная обработка здесь не
 *    учитываются, поэтому оценка выходит не ниже фактической. Так и задумано:
 *    на этих числах стоит дневной предохранитель расхода, и ошибаться он
 *    должен в сторону осторожности.
 * 2. **Считается только наш трафик.** Ключ Anthropic общий с techperevod
 *    (`docs/ai-proxy.md`), и в консоли по нему видно оба проекта сразу.
 * 3. **Окно другое.** Здесь скользящие N дней от сегодня, в консоли по
 *    умолчанию — календарный месяц с первого числа.
 *
 * Расшифровка речи идёт на нашем сервере и стоит ноль — это не заглушка, а
 * точная цена (см. PRICE_PER_MTOK в lib/quota-policy.ts).
 */
export const dynamic = "force-dynamic";

const WINDOWS = [7, 30, 90] as const;

const usd = (value: number) => `$${value.toFixed(value < 1 ? 3 : 2)}`;

const dayFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

function cell(cells: Array<{ operation: AiOperation; calls: number; costUsd: number }>, operation: AiOperation) {
  return cells.find((item) => item.operation === operation);
}

export default async function AdminSpendPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const { days: daysRaw } = await searchParams;
  const requested = Number(daysRaw);
  const days = (WINDOWS as readonly number[]).includes(requested) ? requested : 30;

  const [byDay, byUser] = await Promise.all([aiSpendByDay(days), aiSpendByUser(days)]);

  const total = byDay.reduce((sum, row) => sum + row.costUsd, 0);
  const calls = byDay.reduce((sum, row) => sum + row.calls, 0);
  const busiest = byDay.reduce<typeof byDay[number] | null>(
    (max, row) => (max === null || row.costUsd > max.costUsd ? row : max),
    null,
  );
  // Дни сверху вниз от свежего: в работе смотрят «что было вчера», а не «что
  // было месяц назад», и прокручивать за этим страницу не должно требоваться.
  const daysDesc = [...byDay].reverse();

  return <main className="adm-page">
    <section className="adm-section">
      <h2>Расход на распознавание</h2>
      <p className="adm-section-lead">
        Оценка по прейскуранту, то есть не ниже фактической. Со счётом Anthropic не совпадёт:
        ключ там общий с techperevod, а окно — календарный месяц. Подробнее — в комментарии к этой странице.
      </p>
      <div className="adm-search">
        {WINDOWS.map((window) => (
          <Link
            key={window}
            className={window === days ? "adm-chip adm-chip-on" : "adm-chip"}
            href={`/admin/rashod?days=${window}`}
          >
            {window} дней
          </Link>
        ))}
      </div>
      <div className="adm-tiles">
        <div className="adm-tile"><strong>{usd(total)}</strong><span>за {days} дней</span></div>
        <div className="adm-tile"><strong>{calls}</strong><span>обращений</span></div>
        <div className="adm-tile"><strong>{byUser.length}</strong><span>человек расходовали</span></div>
        <div className="adm-tile">
          <strong>{busiest && busiest.costUsd > 0 ? usd(busiest.costUsd) : "—"}</strong>
          <span>самый дорогой день{busiest && busiest.costUsd > 0 ? ` · ${busiest.day}` : ""}</span>
        </div>
      </div>
    </section>

    <section className="adm-section">
      <h2>По дням</h2>
      <p className="adm-section-lead">
        Дни без обращений тоже в таблице: пропуск читался бы как «данных нет», а означает обратное.
      </p>
      <div className="adm-table-wrap">
        <table className="adm-table adm-spend-days">
          <thead>
            <tr>
              <th>День</th>
              {AI_OPERATIONS.map((operation) => <th key={operation}>{OPERATION_SHORT[operation]}</th>)}
              <th>Всего</th>
            </tr>
          </thead>
          <tbody>
            {daysDesc.map((row) => <tr key={row.day}>
              <td>{dayFormat.format(new Date(`${row.day}T12:00:00Z`))}</td>
              {AI_OPERATIONS.map((operation) => {
                const found = cell(row.byOperation, operation);
                return <td key={operation}>
                  {found ? <>{found.calls} <span className="adm-muted">· {usd(found.costUsd)}</span></> : "—"}
                </td>;
              })}
              <td><strong>{row.calls > 0 ? usd(row.costUsd) : "—"}</strong></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    <section className="adm-section">
      <h2>По людям</h2>
      <p className="adm-section-lead">
        Отсортировано по расходу. Средняя себестоимость скрывает то, от чего зависит цена, — распределение:
        один человек на четыре доллара и сорок по три цента это другой сервис, чем сорок по двадцать центов.
      </p>
      {byUser.length === 0
        ? <p className="adm-empty">За этот период распознаванием никто не пользовался.</p>
        : <div className="adm-table-wrap">
            <table className="adm-table adm-spend-people">
              <thead>
                <tr>
                  <th>Человек</th>
                  {AI_OPERATIONS.map((operation) => <th key={operation}>{OPERATION_SHORT[operation]}</th>)}
                  <th>Всего</th>
                </tr>
              </thead>
              <tbody>
                {byUser.map((person) => <tr key={person.userId}>
                  <td>
                    <Link href={`/admin/users?id=${person.userId}`}>
                      {person.email ?? `#${person.userId} · Telegram`}
                    </Link>
                  </td>
                  {AI_OPERATIONS.map((operation) => {
                    const found = cell(person.byOperation, operation);
                    return <td key={operation}>
                      {found ? <>{found.calls} <span className="adm-muted">· {usd(found.costUsd)}</span></> : "—"}
                    </td>;
                  })}
                  <td><strong>{usd(person.costUsd)}</strong></td>
                </tr>)}
              </tbody>
            </table>
          </div>}
    </section>
  </main>;
}
