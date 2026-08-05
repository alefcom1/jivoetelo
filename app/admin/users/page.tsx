import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { listAdminAccessLog, listPeople, personCard } from "@/lib/admin-people";
import { daysLeft } from "@/lib/paid";
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
};

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
                <strong>{card.plan === "premium" ? `${daysLeft(card.accessUntil, new Date())} дн.` : "нет"}</strong>
                <span>платный доступ</span>
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
            <h2>Выдать доступ</h2>
            <p className="adm-section-lead">
              Продлевает платный доступ напрямую, без оплаты и без кода: для компенсации за сбой или для
              своих. Отсчёт идёт от текущего срока, если он ещё не вышел.
            </p>
            <GrantAccess personId={card.id} />
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
                      <td>{daysLeft(person.accessUntil, new Date()) > 0
                        ? `${daysLeft(person.accessUntil, new Date())} дн.`
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
