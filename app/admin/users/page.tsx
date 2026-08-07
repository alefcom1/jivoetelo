import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import {
  listAdminAccessLog,
  listPeople,
  personCard,
  personSpendByDay,
  personTimeline,
} from "@/lib/admin-people";
import { AWARDS } from "@/lib/awards";
import { daysLeft } from "@/lib/paid";
import { OPERATION_LABELS } from "@/lib/quota-policy";
import { GrantAccess } from "./grant-access";

/**
 * Люди: поиск, карточка, журнал обращений.
 *
 * Доступ к данным полный — так решено владельцем сервиса. Ограничений здесь
 * нет; вместо них при открытии карточки пишется строка в журнал. Он не
 * мешает смотреть, он отвечает на вопрос «кто и когда смотрел», который
 * задают при жалобе или проверке.
 *
 * Поиск — по почте и идентификатору, но не по содержимому дневника: «кто ел
 * пиццу» это уже не работа с обращением конкретного человека.
 */
export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

const SCOPE_LABELS: Record<string, string> = {
  profile: "карточка",
  diary: "дневник",
  photos: "снимки",
  grant: "выдан доступ",
  revoke: "снят доступ",
};

/**
 * Разделы ленты действий. Ключ приходит из `personTimeline`, где он равен
 * имени таблицы-источника; подпись живёт здесь, чтобы SQL оставался про
 * данные, а не про русский язык.
 */
const EVENT_LABELS: Record<string, string> = {
  meal: "еда",
  weight: "вес",
  ai: "распознавание",
  award: "награда",
  consent: "согласие",
  session: "вход",
  photo: "снимок",
  catalog: "снимок в каталог",
  payment: "оплата",
  voucher: "ваучер",
  report: "отчёт",
};

const usd = (value: number) => `$${value.toFixed(value < 1 ? 3 : 2)}`;

const PAYMENT_LABELS: Record<string, string> = {
  paid: "оплачено",
  checked: "проверка",
  failed: "не прошла",
};

/**
 * Первое слово в подробностях события — ключ из базы: имя операции,
 * награды или статуса платежа. `personTimeline` собирает строку в SQL и
 * по-русски говорить не обязана: перевод — дело интерфейса, а запрос должен
 * оставаться про данные.
 *
 * Незнакомый ключ остаётся как есть. Показать `analyze_photo` некрасиво, но
 * честно; подставить вместо него прочерк или «прочее» значило бы скрыть от
 * читателя журнала то, что в журнале как раз и записано.
 */
function humanDetail(kind: string, detail: string): string {
  // Ключ приходит строкой из базы, а OPERATION_LABELS размечен именно теми
  // операциями, которые есть в политике лимитов. Расширяем тип обращения, а не
  // ключа: неизвестная строка должна дать undefined и остаться как есть, а не
  // считаться допустимой операцией.
  const table: Record<string, string | undefined> | null = kind === "ai" ? OPERATION_LABELS
    : kind === "payment" ? PAYMENT_LABELS
    : null;
  if (table) {
    const [head, ...rest] = detail.split(" · ");
    return [table[head] ?? head, ...rest].join(" · ");
  }
  if (kind === "award") {
    const [head, ...rest] = detail.split(" · ");
    return [AWARDS.find((award) => award.key === head)?.title ?? head, ...rest].join(" · ");
  }
  return detail;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; id?: string }>;
}) {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const { q = "", id } = await searchParams;
  const personId = Number(id);
  const card = Number.isInteger(personId) && personId > 0 ? await personCard(admin.id, personId) : null;
  const people = card ? [] : await listPeople(q);
  const log = card ? await listAdminAccessLog(20, personId) : await listAdminAccessLog(20);
  // Лента и расход нужны только на карточке — на списке они читали бы базу
  // впустую. Параллельно: запросы независимы, а страница ждёт медленнейший.
  const [timeline, spend] = card
    ? await Promise.all([personTimeline(card.id, 200), personSpendByDay(card.id, 30)])
    : [[], []];
  const spendTotal = spend.reduce((sum, row) => sum + row.costUsd, 0);

  return <main className="adm-page">
    <section className="adm-section">
      <h2>Люди</h2>
      {/* Обычная GET-форма, а не поле с обработчиком: строка поиска попадает
          в адрес, и найденное можно переслать себе же в заметки или открыть
          в соседней вкладке. */}
      <form className="adm-search" method="get">
        <input name="q" defaultValue={q} placeholder="почта или номер" aria-label="Поиск человека" />
        <button className="black-button" type="submit">Найти</button>
        {card && <Link className="adm-back" href="/admin/users">← ко всем</Link>}
      </form>
    </section>

    {card
      ? <>
          <section className="adm-section">
            <h2>{card.email ?? `Без почты · Telegram`}</h2>
            <div className="adm-tiles">
              <div className="adm-tile"><strong>{card.id}</strong><span>номер</span></div>
              <div className="adm-tile"><strong>{card.streak.totalDays}</strong><span>дней с записями</span></div>
              <div className="adm-tile"><strong>{card.streak.current}</strong><span>серия сейчас</span></div>
              <div className="adm-tile"><strong>{card.streak.bestStreak}</strong><span>лучшая серия</span></div>
              <div className="adm-tile">
                <strong>{card.plan === "premium" ? `${daysLeft(card.accessUntil, card.createdAt, new Date())} дн.` : "нет"}</strong>
                <span>доступ, дней</span>
              </div>
              <div className="adm-tile"><strong>{card.invitedCount}</strong><span>привёл друзей</span></div>
            </div>
            <p className="adm-muted">
              Зарегистрирован {dateFormat.format(card.createdAt)}
              {card.telegramLinked ? " · Telegram привязан" : " · Telegram не привязан"}
              {card.invitedByEmail ? ` · пришёл по приглашению ${card.invitedByEmail}` : ""}
              {card.referralCode ? ` · код приглашения ${card.referralCode}` : ""}
              {card.latestWeightKg !== null ? ` · последний вес ${String(card.latestWeightKg).replace(".", ",")} кг` : ""}
            </p>
          </section>

          <section className="adm-section">
            <h2>Доступ</h2>
            <p className="adm-section-lead">
              Сейчас {card.plan === "premium" ? "доступ открыт" : "доступа нет"}. Выдача идёт напрямую,
              без оплаты и без кода — для компенсации за сбой или для своих; отсчёт от текущего срока, если он
              ещё не вышел, и от конца пробного месяца, если он ещё идёт. Отзыв снимает оплаченный срок
              целиком; пробный месяц он не трогает — тот считается от даты регистрации и не хранится.
            </p>
            <GrantAccess personId={card.id} hasAccess={card.plan === "premium"} />
          </section>

          <section className="adm-section">
            <h2>Расход на распознавание</h2>
            <p className="adm-section-lead">
              Сколько этот человек стоит сервису. Оценка по прейскуранту за последние 30 дней —
              общая картина на <Link href="/admin/rashod">странице расхода</Link>.
            </p>
            {spend.length === 0
              ? <p className="adm-empty">Распознаванием не пользовался.</p>
              : <>
                  <div className="adm-tiles">
                    <div className="adm-tile"><strong>{usd(spendTotal)}</strong><span>за 30 дней</span></div>
                    <div className="adm-tile">
                      <strong>{spend.reduce((sum, row) => sum + row.calls, 0)}</strong>
                      <span>обращений</span>
                    </div>
                  </div>
                  <div className="adm-table-wrap">
                    <table className="adm-table">
                      <thead><tr><th>День</th><th>Обращений</th><th>Стоимость</th></tr></thead>
                      <tbody>
                        {spend.map((row) => <tr key={row.day}>
                          <td>{row.day}</td>
                          <td>{row.calls}</td>
                          <td>{usd(row.costUsd)}</td>
                        </tr>)}
                      </tbody>
                    </table>
                  </div>
                </>}
          </section>

          {card.awards.length > 0 && <section className="adm-section">
            <h2>Награды</h2>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead><tr><th>Награда</th><th>Взята</th></tr></thead>
                <tbody>
                  {card.awards.map((award) => <tr key={award.title}>
                    <td>{award.title}</td>
                    <td>{dateFormat.format(new Date(`${award.earnedOn}T12:00:00Z`))}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </section>}

          <section className="adm-section">
            <h2>Последние записи</h2>
            {card.recentMeals.length === 0
              ? <p className="adm-empty">Записей нет.</p>
              : <div className="adm-table-wrap">
                  <table className="adm-table">
                    <thead><tr><th>Дата</th><th>Время</th><th>Что записано</th></tr></thead>
                    <tbody>
                      {card.recentMeals.map((meal) => <tr key={meal.id}>
                        <td>{meal.eatenOn}</td>
                        <td>{meal.eatenTime}</td>
                        <td>{meal.sourceText ?? "—"}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>}
          </section>

          <section className="adm-section">
            <h2>Все действия</h2>
            <p className="adm-section-lead">
              Всё, что сервис записал про этого человека, одной лентой: еда, вес, обращения к распознаванию,
              входы, согласия, снимки, награды, оплаты и отчёты. Просмотров страниц здесь нет — мы их не
              пишем; это не пробел, а решение не заводить слежку за перемещениями по экранам.
            </p>
            {timeline.length === 0
              ? <p className="adm-empty">Действий не записано.</p>
              : <div className="adm-table-wrap">
                  <table className="adm-table adm-timeline">
                    <thead><tr><th>Когда</th><th>Что</th><th>Подробности</th></tr></thead>
                    <tbody>
                      {timeline.map((event, index) => <tr key={`${event.kind}-${index}`}>
                        <td>{dateTimeFormat.format(event.at)}</td>
                        <td>{EVENT_LABELS[event.kind] ?? event.kind}</td>
                        <td>{humanDetail(event.kind, event.detail)}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>}
          </section>
        </>
      : <section className="adm-section">
          {people.length === 0
            ? <p className="adm-empty">{q ? "Никого не нашлось." : "Пока никто не зарегистрирован."}</p>
            : <div className="adm-table-wrap">
                {/* Своё имя у таблицы: на странице их три (люди, награды,
                    журнал), и «первая таблица» — ненадёжный способ сослаться
                    на нужную ни в стилях, ни в проверках. */}
                <table className="adm-table adm-people">
                  <thead>
                    <tr><th>Почта</th><th>Регистрация</th><th>Дней</th><th>Последняя запись</th><th>Доступ</th></tr>
                  </thead>
                  <tbody>
                    {people.map((person) => <tr key={person.id}>
                      <td>
                        <Link href={`/admin/users?id=${person.id}`}>
                          {person.email ?? `#${person.id} · Telegram`}
                        </Link>
                      </td>
                      <td>{dateFormat.format(person.createdAt)}</td>
                      <td>{person.loggedDays}</td>
                      <td>{person.lastMealOn ?? "—"}</td>
                      <td>{daysLeft(person.accessUntil, person.createdAt, new Date()) > 0
                        ? `${daysLeft(person.accessUntil, person.createdAt, new Date())} дн.`
                        : "—"}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>}
        </section>}

    <section className="adm-section">
      <h2>Журнал обращений</h2>
      <p className="adm-section-lead">
        {card
          ? "Кто и когда открывал карточку этого человека."
          : "Кто и когда открывал чьи-либо персональные данные. Сводные цифры сюда не идут."}
      </p>
      {log.length === 0
        ? <p className="adm-empty">Обращений не было.</p>
        : <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Когда</th><th>Кто</th><th>Что</th><th>Чьи</th></tr></thead>
              <tbody>
                {log.map((row) => <tr key={row.id}>
                  <td>{dateTimeFormat.format(row.createdAt)}</td>
                  <td>{row.adminEmail ?? "—"}</td>
                  <td>{SCOPE_LABELS[row.scope] ?? row.scope}</td>
                  <td>{row.subjectId ? `#${row.subjectId}` : "—"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
    </section>
  </main>;
}
