/**
 * Правила доступа специалиста к данным клиента.
 *
 * Модуль намеренно чистый: ни базы, ни сессии, ни `new Date()` внутри. Всё
 * приходит аргументами, и потому «отозванный доступ больше не открывается»
 * проверяется обычным тестом, а не подъёмом Postgres.
 *
 * ## Пять правил, из которых выведено остальное
 *
 * 1. **По умолчанию нет доступа.** Не «есть, пока не запретили», а «нет, пока
 *    не разрешили». Отсутствие строки, истёкшее приглашение, неподтверждённый
 *    специалист, ошибка в данных — всё это «нет».
 * 2. **Разрешает только клиент и только у себя.** Специалист не может
 *    расширить свой доступ ни одним действием; он может лишь попросить.
 * 3. **Объём дробный.** Недельные итоги, дневник и вес разрешаются
 *    по отдельности. «Согласен» без выбора объёма не бывает.
 * 4. **Отзыв мгновенный.** С момента `revokedAt` не открывается ничего,
 *    включая то, что было разрешено раньше.
 * 5. **Только чтение.** В этом модуле нет и не будет права записи: специалист
 *    не редактирует чужой дневник. Ошибку в записи исправляет тот, кто ел.
 *
 * Пятое правило стоит пояснить, потому что оно ограничивает продукт. Дневник —
 * это показания человека о себе. Специалист, правящий их молча, превращает
 * дневник в документ, которому владелец больше не может доверять; а дальше
 * теряется смысл и самих цифр. Если исправление нужно — специалист говорит об
 * этом клиенту, и правит клиент.
 */

/** Что именно смотрят. Совпадает с полями `share*` в `specialist_clients`. */
export type AccessScope = "summary" | "diary" | "weight";

export const ACCESS_SCOPES: readonly AccessScope[] = ["summary", "diary", "weight"] as const;

/** Строка связи в том виде, в каком её отдаёт база. */
export type ClientLink = {
  specialistUserId: number;
  clientUserId: number;
  shareSummary: boolean;
  shareDiary: boolean;
  shareWeight: boolean;
  revokedAt: Date | null;
};

/** Статус специалиста из таблицы `specialists`. */
export type SpecialistStatus = "pending" | "approved" | "rejected" | "suspended";

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: AccessDenial };

/**
 * Почему отказано. Причина нужна не для сообщения пользователю — специалисту
 * мы во всех случаях показываем одно и то же, — а для журнала и тестов:
 * «нет связи» и «связь есть, но объём не разрешён» это разные дефекты.
 */
export type AccessDenial =
  | "no_specialist"
  | "specialist_not_approved"
  | "no_link"
  | "revoked"
  | "scope_not_granted"
  | "self";

const GRANT_FIELD: Record<AccessScope, keyof Pick<ClientLink, "shareSummary" | "shareDiary" | "shareWeight">> = {
  summary: "shareSummary",
  diary: "shareDiary",
  weight: "shareWeight",
};

/**
 * Можно ли специалисту посмотреть данные клиента в объёме `scope`.
 *
 * `link` — строка связи или `null`, если её нет вовсе. `status` — статус
 * специалиста или `null`, если он не заводил профиль. `now` нужен для
 * сравнения с `revokedAt`: отзыв может быть записан будущим временем только
 * по ошибке, и полагаться на «раз поле не пусто — значит отозвано» нельзя.
 */
export function canAccess(input: {
  specialistUserId: number;
  clientUserId: number;
  status: SpecialistStatus | null;
  link: ClientLink | null;
  scope: AccessScope;
  now: Date;
}): AccessDecision {
  const deny = (reason: AccessDenial): AccessDecision => ({ allowed: false, reason });

  // Свои данные человек смотрит в своём кабинете, а не через кабинет Про.
  // Отдельная ветка, потому что иначе специалист-без-связи и специалист-сам-себе
  // дали бы один и тот же отказ, и первое скрыло бы второе в журнале.
  if (input.specialistUserId === input.clientUserId) return deny("self");

  if (!input.status) return deny("no_specialist");
  if (input.status !== "approved") return deny("specialist_not_approved");

  const link = input.link;
  if (!link) return deny("no_link");
  // Строка от другой пары — не наша забота, но и не повод верить ей.
  if (link.specialistUserId !== input.specialistUserId) return deny("no_link");
  if (link.clientUserId !== input.clientUserId) return deny("no_link");

  if (link.revokedAt !== null && link.revokedAt.getTime() <= input.now.getTime()) return deny("revoked");

  if (!link[GRANT_FIELD[input.scope]]) return deny("scope_not_granted");
  return { allowed: true };
}

/**
 * Что именно разрешено в этой связи. Нужен интерфейсу: показывать вкладку
 * «Дневник», которая при клике откажет, — худший вид отказа.
 */
export function grantedScopes(link: ClientLink | null, now: Date): AccessScope[] {
  if (!link) return [];
  if (link.revokedAt !== null && link.revokedAt.getTime() <= now.getTime()) return [];
  return ACCESS_SCOPES.filter((scope) => link[GRANT_FIELD[scope]]);
}

/**
 * Проверяет набор галочек, пришедший из формы согласия.
 *
 * Пустой набор — не ошибка ввода, а осмысленный ответ «ничего не показывать»,
 * и обрабатывать его должен вызывающий: связь с пустым объёмом заводить
 * незачем, это просто отказ.
 */
export function normalizeScopes(raw: unknown): AccessScope[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<AccessScope>();
  for (const value of raw) {
    if (typeof value === "string" && (ACCESS_SCOPES as readonly string[]).includes(value)) {
      seen.add(value as AccessScope);
    }
  }
  return ACCESS_SCOPES.filter((scope) => seen.has(scope));
}

/** Набор галочек → поля таблицы. */
export function scopesToGrants(scopes: AccessScope[]): Pick<ClientLink, "shareSummary" | "shareDiary" | "shareWeight"> {
  return {
    shareSummary: scopes.includes("summary"),
    shareDiary: scopes.includes("diary"),
    shareWeight: scopes.includes("weight"),
  };
}

/** Человеческие названия объёмов — одни и те же в согласии, журнале и кабинете. */
export const SCOPE_LABELS: Record<AccessScope, string> = {
  summary: "Итоги недели",
  diary: "Дневник питания",
  weight: "Вес и тренд",
};

/**
 * Что именно увидит специалист. Формулировки нарочно конкретные: «доступ к
 * данным» — не согласие, потому что человек не может представить, на что
 * соглашается.
 */
export const SCOPE_DETAILS: Record<AccessScope, string> = {
  summary: "Сколько энергии, белка и клетчатки в среднем за неделю, в какие дни были записи.",
  diary: "Что и когда вы ели, с фотографиями и заметками.",
  weight: "Записи веса и сглаженный тренд.",
};
