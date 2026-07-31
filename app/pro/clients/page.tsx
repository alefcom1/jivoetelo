import type { Metadata } from "next";
import Link from "next/link";
import "../cabinet.css";
import { getCurrentUser } from "@/lib/auth";
import { formatDayRu, localToday } from "@/lib/dates";
import { grantedScopes, SCOPE_LABELS, type ClientLink } from "@/lib/pro/access";
import { getSpecialistProfile, requireApprovedSpecialist } from "@/lib/pro/guard";
import { clientStatus } from "@/lib/pro/status";
import { listClients } from "@/lib/pro/store";
import { InvitePanel } from "./invite-panel";

export const metadata: Metadata = {
  title: "Клиенты — Живое Тело Pro",
};

/**
 * Список клиентов специалиста.
 *
 * `requireApprovedSpecialist` не говорит, ПОЧЕМУ отказано — так и задумано
 * для постороннего посетителя (см. комментарий в lib/pro/guard.ts). Но здесь
 * страница показывается человеку про его же собственный статус, а не
 * постороннему: сказать «вы не вошли», «у вас нет профиля» или «заявка на
 * рассмотрении» — это не утечка, а единственный способ объяснить, что
 * делать дальше. Поэтому при отказе мы отдельно смотрим на `getCurrentUser`
 * и `getSpecialistProfile`, только чтобы подобрать текст экрана.
 */
export default async function ClientsPage() {
  const specialist = await requireApprovedSpecialist();

  if (!specialist) {
    const user = await getCurrentUser();
    if (!user) {
      return (
        <main className="pro-cab-gate">
          <h1>Кабинет специалиста</h1>
          <p>Чтобы открыть раздел «Живое Тело Pro», сначала войдите в свой аккаунт.</p>
          <Link className="black-button" href="/login">Войти <b>↗</b></Link>
        </main>
      );
    }

    const profile = await getSpecialistProfile(user.id);
    if (!profile) {
      return (
        <main className="pro-cab-gate">
          <h1>Кабинет специалиста</h1>
          <p>
            Этот раздел — для специалистов пилотной группы «Живое Тело Pro». Если вы ведёте
            клиентов и хотите присоединиться, оставьте заявку — мы разговариваем с каждым лично.
          </p>
          <Link className="black-button" href="/pro#apply">Оставить заявку <b>↗</b></Link>
        </main>
      );
    }

    if (profile.status === "pending") {
      return (
        <main className="pro-cab-gate">
          <h1>Заявка на рассмотрении</h1>
          <p>
            Мы получили вашу заявку и разговариваем с кандидатами по очереди, вручную. Как только
            примем решение, напишем на адрес, указанный в анкете.
          </p>
        </main>
      );
    }

    // rejected или suspended — статусы, о которых мы уже написали человеку
    // отдельно (решение принято не автоматически, а после разговора), и
    // повторять здесь подробности незачем: экран лишь подтверждает, что
    // раздел сейчас недоступен.
    return (
      <main className="pro-cab-gate">
        <h1>Кабинет специалиста</h1>
        <p>Доступ к разделу сейчас закрыт. Если у вас остались вопросы, ответьте на письмо по итогам заявки.</p>
      </main>
    );
  }

  const now = new Date();
  const today = localToday();
  const clients = await listClients(specialist.userId);

  return (
    <main className="pro-cab">
      <div className="pro-cab-head">
        <h1>Клиенты</h1>
        <p>
          Список тех, кто принял ваше приглашение. Объём данных выбирает каждый клиент сам — вы
          видите ровно то, что он открыл, и ничего сверх этого.
        </p>
      </div>

      <InvitePanel />

      {clients.length === 0 ? (
        <section className="pro-cab-empty">
          <p>
            Список пока пуст. Выдайте код приглашения выше и назовите его клиенту — он введёт код
            у себя в приложении и сам выберет, что вам показать.
          </p>
        </section>
      ) : (
        <ul className="pro-cab-list">
          {clients.map((client) => {
            // ClientRow отдаёт только не отозванные связи (см. listClients в
            // lib/pro/store.ts), поэтому revokedAt здесь всегда null — это
            // не предположение, а гарантия самого запроса.
            const link: ClientLink = {
              specialistUserId: specialist.userId,
              clientUserId: client.clientUserId,
              shareSummary: client.shareSummary,
              shareDiary: client.shareDiary,
              shareWeight: client.shareWeight,
              revokedAt: null,
            };
            const scopes = grantedScopes(link, now);
            // Метка — вместе с основанием, из которого она сделана. Голый
            // ярлык был бы утверждением о человеке, показанным третьему лицу:
            // клиент согласился делиться данными, а не быть охарактеризованным.
            const status = clientStatus({
              loggedDays: client.loggedDays,
              lastMealOn: client.lastMealOn,
              today,
            });

            return (
              <li key={client.clientUserId}>
                <Link className="pro-cab-card" href={`/pro/clients/${client.clientUserId}`}>
                  <div className="pro-cab-title">
                    <h2>{client.clientName || "Без имени"}</h2>
                    <p className={`pro-cab-status pro-cab-status-${status.kind}`}>
                      <b>{status.label}</b>
                      <span>{status.basis}</span>
                    </p>
                  </div>
                  <div className="pro-cab-chips">
                    {scopes.length === 0
                      ? <span className="pro-cab-chip pro-cab-chip-muted">данные не открыты</span>
                      : scopes.map((scope) => (
                          <span className="pro-cab-chip" key={scope}>{SCOPE_LABELS[scope]}</span>
                        ))}
                  </div>
                  <p className="pro-cab-meta">
                    {client.lastMealOn ? `Последняя запись — ${formatDayRu(client.lastMealOn)}` : "Записей пока нет"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
