import { listApplications, listSpecialists } from "@/lib/pro/store";
import type { SpecialistStatus } from "@/lib/pro/access";
import { confirmSpecialistAction, setSpecialistStatusAction } from "../actions";

const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Человеческие подписи статуса — одни и те же в таблице и нигде больше. */
const STATUS_LABELS: Record<string, string> = {
  pending: "На рассмотрении",
  approved: "Подтверждён",
  rejected: "Отклонён",
  suspended: "Приостановлен",
};

/** Тексты отказа `createSpecialistByEmail` — ровно два кода, ровно два текста. */
const CONFIRM_ERRORS: Record<string, string> = {
  no_user: "У этой почты нет аккаунта на сайте. Человек должен сначала зарегистрироваться.",
  exists: "Профиль специалиста уже заведён.",
};

/**
 * Какие переходы статуса осмысленны из текущего. Не показываем кнопку,
 * ведущую туда, где специалист и так уже находится, и не показываем
 * «Приостановить» тому, кто ещё не был подтверждён — приостанавливать
 * нечего.
 */
function statusActions(status: string): { label: string; target: SpecialistStatus }[] {
  switch (status) {
    case "pending":
      return [
        { label: "Подтвердить", target: "approved" },
        { label: "Отклонить", target: "rejected" },
      ];
    case "approved":
      return [
        { label: "Приостановить", target: "suspended" },
        { label: "Отклонить", target: "rejected" },
      ];
    case "suspended":
      return [
        { label: "Подтвердить", target: "approved" },
        { label: "Отклонить", target: "rejected" },
      ];
    case "rejected":
      return [{ label: "Подтвердить", target: "approved" }];
    default:
      return [];
  }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ admError?: string; admEmail?: string; admConfirmed?: string }>;
}) {
  const [applications, specialists] = await Promise.all([listApplications(), listSpecialists()]);
  const { admError, admEmail, admConfirmed } = await searchParams;

  return (
    <>
      <section className="adm-section" id="applications">
        <h2>Заявки на кабинет</h2>
        <p className="adm-section-lead">
          Первую группу набираем руками: каждую заявку читаем и решаем сами, а не по галочке в форме.
          «Подтвердить как специалиста» заводит профиль по указанной почте — сработает только для тех, у кого уже
          есть аккаунт на сайте.
        </p>

        {applications.length === 0 ? (
          <p className="adm-empty">Заявок пока нет.</p>
        ) : (
          <div className="adm-app-list">
            {applications.map((app) => (
              <article className="adm-app-card" id={`application-${app.id}`} key={app.id}>
                <div className="adm-app-top">
                  <b>{app.name}</b>
                  <time>{dateTimeFormat.format(app.createdAt)}</time>
                </div>
                <ul className="adm-app-meta">
                  <li>
                    Почта: <b>{app.email}</b>
                  </li>
                  {app.specialization && (
                    <li>
                      Специализация: <b>{app.specialization}</b>
                    </li>
                  )}
                  {app.city && (
                    <li>
                      Город: <b>{app.city}</b>
                    </li>
                  )}
                  {app.clientsCount && (
                    <li>
                      Клиентов сейчас: <b>{app.clientsCount}</b>
                    </li>
                  )}
                  {app.currentTools && (
                    <li>
                      Сейчас пользуется: <b>{app.currentTools}</b>
                    </li>
                  )}
                </ul>
                {app.comment && <p className="adm-app-comment">«{app.comment}»</p>}

                {admError && admEmail === app.email && (
                  <p className="form-error">{CONFIRM_ERRORS[admError] ?? "Не получилось. Попробуйте ещё раз."}</p>
                )}

                <form className="adm-confirm" action={confirmSpecialistAction}>
                  <input type="hidden" name="applicationId" value={app.id} />
                  <input type="hidden" name="email" value={app.email} />
                  <label>
                    Имя для клиентов
                    <input name="displayName" defaultValue={app.name} required maxLength={100} />
                  </label>
                  <label>
                    Специализация
                    <input name="specialization" defaultValue={app.specialization ?? ""} maxLength={100} />
                  </label>
                  <label>
                    Город
                    <input name="city" defaultValue={app.city ?? ""} maxLength={100} />
                  </label>
                  <button className="black-button" type="submit">
                    Подтвердить как специалиста
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="adm-section" id="specialists">
        <h2>Специалисты</h2>
        <p className="adm-section-lead">Статус решает не только видимость в разделе, но и доступ к данным клиентов — см. пояснение у кнопки «Приостановить».</p>

        {admConfirmed && <p className="adm-banner">Профиль специалиста создан: {admConfirmed}.</p>}

        {specialists.length === 0 ? (
          <p className="adm-empty">Специалистов пока нет.</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Почта</th>
                  <th>Статус</th>
                  <th>Клиентов</th>
                  <th>Заведён</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {specialists.map((s) => (
                  <tr key={s.userId}>
                    <td>
                      {s.displayName}
                      {s.specialization && (
                        <>
                          <br />
                          <span className="adm-muted">{s.specialization}</span>
                        </>
                      )}
                    </td>
                    <td>{s.email}</td>
                    <td>
                      <span className={`adm-status adm-status-${s.status}`}>{STATUS_LABELS[s.status] ?? s.status}</span>
                    </td>
                    <td>{s.clientCount}</td>
                    <td>{dateTimeFormat.format(s.createdAt)}</td>
                    <td>
                      <div className="adm-status-actions">
                        {statusActions(s.status).map((a) => (
                          <form action={setSpecialistStatusAction} key={a.target}>
                            <input type="hidden" name="userId" value={s.userId} />
                            <input type="hidden" name="status" value={a.target} />
                            <button className={a.target === "rejected" ? "danger-button" : "link-button"} type="submit">
                              {a.label}
                            </button>
                          </form>
                        ))}
                      </div>
                      {s.status === "approved" && (
                        <p className="adm-suspend-note">
                          После приостановки специалист сразу перестанет видеть данные всех своих клиентов: проверка
                          доступа смотрит на статус специалиста при каждом обращении, а не только в момент выдачи
                          приглашения. Связи с клиентами при этом не удаляются — доступ вернётся, если статус снова
                          станет «Подтверждён».
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
