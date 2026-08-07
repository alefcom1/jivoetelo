import {
  activity,
  aiSpend,
  awardSpread,
  firstStepsFunnel,
  paidSummary,
  registrationSources,
  registrationsByDay,
  retention,
} from "@/lib/admin-stats";
import { awardByKey } from "@/lib/awards";
import { OPERATION_LABELS } from "@/lib/quota";
import { voucherSummary } from "@/lib/vouchers-store";

/**
 * Обзор: цифры, по которым принимают решения.
 *
 * Чего здесь сознательно нет — «всего пользователей» крупным шрифтом. Это
 * число растёт само собой, ни на что не влияет и смотрится один раз. Вместо
 * него удержание: сервисом дневника пользуются или не пользуются на второй
 * неделе, и это единственное, что говорит, работает ли продукт.
 *
 * Страница читает только сводные цифры — ничьего дневника здесь нет, поэтому
 * в журнал обращений она не пишет (см. drizzle/0024).
 */
export const dynamic = "force-dynamic";

const share = (value: number) => `${Math.round(value * 100)}%`;

/** Столбики регистраций. SVG вместо библиотеки: тридцать чисел — это тридцать прямоугольников. */
function Sparkbars({ points }: { points: Array<{ day: string; count: number }> }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const width = points.length * 12;
  // preserveAspectRatio="none" обязателен: по умолчанию SVG вписывается
  // целиком и при фиксированной высоте в 60px сжимается до своей натуральной
  // ширины, собираясь комком посреди страницы. Пропорции здесь и не нужны —
  // по горизонтали лежит номер дня, а не величина.
  return <svg className="adm-bars" viewBox={`0 0 ${width} 60`} preserveAspectRatio="none" role="img"
    aria-label={`Регистрации по дням, максимум ${max} в день`}>
    {points.map((point, i) => (
      <rect
        key={point.day}
        x={i * 12 + 2} y={60 - (point.count / max) * 56}
        width={8} height={Math.max(1, (point.count / max) * 56)}
        rx={2}
      >
        <title>{`${point.day}: ${point.count}`}</title>
      </rect>
    ))}
  </svg>;
}

export default async function AdminOverviewPage() {
  const [days, sources, keep, act, funnel, spend, awards, paid, vouchers] = await Promise.all([
    registrationsByDay(30),
    registrationSources(30),
    retention([1, 7, 30]),
    activity(),
    firstStepsFunnel(),
    aiSpend(30),
    awardSpread(),
    paidSummary(),
    voucherSummary(),
  ]);

  const monthTotal = days.reduce((sum, point) => sum + point.count, 0);
  const spendTotal = spend.reduce((sum, row) => sum + row.costUsd, 0);
  // Себестоимость активного человека за месяц — то самое число, без которого
  // цену назначать наугад.
  const perActive = act.month > 0 ? spendTotal / act.month : 0;

  return <main className="adm-page">
    <section className="adm-section">
      <h2>Кто пользуется</h2>
      <div className="adm-tiles">
        <div className="adm-tile"><strong>{act.today}</strong><span>записали сегодня</span></div>
        <div className="adm-tile"><strong>{act.week}</strong><span>за неделю</span></div>
        <div className="adm-tile"><strong>{act.month}</strong><span>за месяц</span></div>
        <div className="adm-tile"><strong>{act.medianMealsWeek}</strong><span>записей за неделю, медиана</span></div>
      </div>
      <p className="adm-muted">
        Медиана — по людям, а не по записям: один человек с сорока записями не должен отвечать за всех.
      </p>
    </section>

    <section className="adm-section">
      <h2>Удержание</h2>
      <p className="adm-section-lead">
        Доля зарегистрировавшихся, у кого есть запись на этот день и позже. В когорту идут только те,
        кто зарегистрировался достаточно давно, чтобы успеть дожить.
      </p>
      <div className="adm-tiles">
        {keep.map((point) => (
          <div className="adm-tile" key={point.day}>
            <strong>{share(point.share)}</strong>
            <span>день {point.day} · {point.returned} из {point.cohort}</span>
          </div>
        ))}
      </div>
    </section>

    <section className="adm-section">
      <h2>Регистрации за 30 дней</h2>
      <Sparkbars points={days} />
      <div className="adm-tiles">
        <div className="adm-tile"><strong>{monthTotal}</strong><span>всего за месяц</span></div>
        <div className="adm-tile"><strong>{sources.web}</strong><span>с почтой (веб)</span></div>
        <div className="adm-tile"><strong>{sources.telegram}</strong><span>без почты (Mini App)</span></div>
        <div className="adm-tile"><strong>{sources.invited}</strong><span>по приглашению</span></div>
      </div>
      <p className="adm-muted">
        «По приглашению» — не третий источник, а признак: такие есть и среди пришедших с почтой, и среди тех, кто без неё.
      </p>
    </section>

    <section className="adm-section">
      <h2>Первые шаги</h2>
      <ol className="adm-funnel">
        {funnel.map((step, i) => {
          const first = funnel[0].count;
          const previous = i === 0 ? null : funnel[i - 1].count;
          return <li key={step.key}>
            <b>{step.label}</b>
            <span>{step.count}</span>
            {first > 0 && <em>{share(step.count / first)} от всех</em>}
            {/* Падение к предыдущему шагу — то, ради чего воронку и смотрят:
                оно показывает, где именно люди останавливаются. */}
            {previous !== null && previous > 0 && <i>{share(step.count / previous)} от предыдущего</i>}
          </li>;
        })}
      </ol>
    </section>

    <section className="adm-section">
      <h2>Расход на распознавание за 30 дней</h2>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Операция</th><th>Обращений</th><th>Стоимость</th></tr></thead>
          <tbody>
            {spend.length === 0
              ? <tr><td colSpan={3}>Обращений не было.</td></tr>
              : spend.map((row) => <tr key={row.operation}>
                  <td>{OPERATION_LABELS[row.operation] ?? row.operation}</td>
                  <td>{row.calls}</td>
                  <td>${row.costUsd.toFixed(2)}</td>
                </tr>)}
          </tbody>
          <tfoot>
            <tr>
              <td>Итого</td>
              <td>{spend.reduce((sum, row) => sum + row.calls, 0)}</td>
              <td>${spendTotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="adm-muted">
        На одного активного за месяц: ${perActive.toFixed(3)}. Оценка по прейскуранту, то есть не ниже
        фактической, — предохранитель должен ошибаться в сторону осторожности.
      </p>
    </section>

    <section className="adm-section">
      <h2>Платный доступ</h2>
      <div className="adm-tiles">
        <div className="adm-tile"><strong>{paid.active}</strong><span>доступ открыт сейчас</span></div>
        <div className="adm-tile"><strong>{paid.expiringWeek}</strong><span>кончается на этой неделе</span></div>
        <div className="adm-tile"><strong>{paid.paidEver}</strong><span>платили хоть раз</span></div>
        <div className="adm-tile"><strong>{vouchers.used} / {vouchers.issued}</strong><span>ваучеров погашено</span></div>
      </div>
    </section>

    <section className="adm-section">
      <h2>Награды</h2>
      {awards.length === 0
        ? <p className="adm-empty">Пока никто не дошёл до первой награды.</p>
        : <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Награда</th><th>Человек</th></tr></thead>
              <tbody>
                {awards.map((row) => <tr key={row.key}>
                  <td>{awardByKey(row.key)?.title ?? row.key}</td>
                  <td>{row.count}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
    </section>
  </main>;
}
