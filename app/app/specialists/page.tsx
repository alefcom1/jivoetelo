import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ACCESS_SCOPES, SCOPE_LABELS, type AccessScope } from "@/lib/pro/access";
import { listAccessLog, listSpecialistsForClient } from "@/lib/pro/store";
import { AccessList } from "./access-list";
import { InviteForm } from "./invite-form";
import "./specialists.css";

const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function isAccessScope(value: string): value is AccessScope {
  return (ACCESS_SCOPES as readonly string[]).includes(value);
}

/**
 * Самый чувствительный экран сервиса: здесь человек решает, показывать ли
 * постороннему свой дневник питания. Три блока сверху вниз — ввод кода,
 * список того, кому уже открыт доступ, и журнал обращений, — и ни один из
 * них не спрятан за дополнительным кликом, кроме самого ввода кода, когда
 * доступ уже кому-то открыт: тогда не он, а список действующих доступов
 * главное, что должен увидеть человек, вернувшись на этот экран.
 */
export default async function SpecialistsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [links, log] = await Promise.all([
    listSpecialistsForClient(user.id),
    listAccessLog(user.id, 50),
  ]);

  const hasActiveAccess = links.some((link) => link.revokedAt === null);

  return (
    <main className="settings spec-page">
      <h1>Живое Тело Pro</h1>
      <p className="spec-lead">
        Здесь вы решаете, кто из специалистов видит ваш дневник, и в каком объёме. Доступ открывается
        только вами, действует только на чтение, и его можно закрыть в любой момент — без объяснений.
      </p>

      <section className="settings-block">
        <p className="settings-label">Код приглашения</p>
        <InviteForm defaultOpen={!hasActiveAccess} />
      </section>

      <section className="settings-block">
        <p className="settings-label">Кто видит ваши данные</p>
        <AccessList links={links} />
      </section>

      <section className="settings-block">
        <p className="settings-label">Журнал доступа</p>
        {log.length === 0
          ? <p className="field-note">Никто ещё не открывал ваши данные.</p>
          : <ul className="spec-log">
              {log.map((entry, index) => (
                // Составной ключ, а не id: `listAccessLog` его не отдаёт (не
                // нужен нигде, кроме этого списка), а порядок строк для
                // клиента стабилен — список только дополняется сверху.
                <li key={`${entry.at.getTime()}-${index}`}>
                  <b>{entry.specialistName}</b>
                  <span>
                    {dateTimeFormat.format(entry.at)} · {isAccessScope(entry.scope) ? SCOPE_LABELS[entry.scope] : entry.scope}
                  </span>
                </li>
              ))}
            </ul>}
      </section>
    </main>
  );
}
