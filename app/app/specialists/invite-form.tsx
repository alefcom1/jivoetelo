"use client";

/**
 * Ввод кода приглашения и экран согласия — два шага одной формы.
 *
 * Оба шага и переход между ними выводятся из состояния без единого эффекта:
 * `useActionState` уже хранит результат последнего `checkCode` (в том числе
 * код и имя специалиста), и достаточно посмотреть на его `status`, чтобы
 * решить, что показывать. `declinedCode` — единственный кусок состояния,
 * который заводит сам компонент: без него «Отказаться» было бы нечем
 * отличить от «код ещё не проверен», раз сам результат проверки никуда
 * не делся и код остаётся «найден».
 */

import { useActionState, useState } from "react";
import { ACCESS_SCOPES, SCOPE_DETAILS, SCOPE_LABELS, type AccessScope } from "@/lib/pro/access";
import { INVITE_CODE_LENGTH } from "@/lib/pro/invite";
import { checkCode, grantAccess, type CheckCodeState, type GrantAccessState } from "./actions";

const CHECK_ERRORS: Partial<Record<CheckCodeState["status"], string>> = {
  invalid: `Код — ${INVITE_CODE_LENGTH} знаков, без пробелов и дефисов. Проверьте и попробуйте ещё раз.`,
  not_found: "Такой код не найден. Уточните его у специалиста ещё раз.",
  expired: "Этот код уже истёк — он действует час. Попросите у специалиста новый.",
  used: "Этот код уже использован. Попросите у специалиста новый.",
  self: "Это код вашего собственного приглашения — им нельзя открыть доступ самому себе.",
};

const GRANT_ERRORS: Partial<Record<GrantAccessState["status"], string>> = {
  invalid: "Код стал недействителен. Начните ввод заново.",
  not_found: "Код стал недействителен. Начните ввод заново.",
  expired: "Код истёк, пока вы заполняли форму. Попросите у специалиста новый.",
  used: "Этот код уже использован — возможно, в другой вкладке. Попросите у специалиста новый.",
  self: "Это код вашего собственного приглашения.",
  empty_scope: "Отметьте хотя бы один раздел — иначе открывать нечего.",
  error: "Не получилось сохранить. Попробуйте ещё раз.",
};

export function InviteForm({ defaultOpen }: { defaultOpen: boolean }) {
  const [opened, setOpened] = useState(defaultOpen);
  // Код, для которого человек уже нажал «Отказаться». Проверка могла найти
  // приглашение — но пока это тот же код, экран согласия больше не показываем.
  const [declinedCode, setDeclinedCode] = useState<string | null>(null);

  const [checkState, checkAction, checkPending] = useActionState(checkCode, { status: "idle" } as CheckCodeState);
  const [grantState, grantAction, grantPending] = useActionState(grantAccess, { status: "idle" } as GrantAccessState);

  if (grantState.status === "success") {
    return <p className="spec-invite-done">Доступ открыт. Изменить его или отозвать можно в любой момент ниже.</p>;
  }

  if (!opened) {
    return <button className="black-button" type="button" onClick={() => setOpened(true)}>Ввести код приглашения</button>;
  }

  const found = checkState.status === "found" && checkState.code !== undefined && checkState.specialistName !== undefined;
  if (found && checkState.code !== declinedCode) {
    return (
      <ConsentStep
        // key пересоздаёт форму при каждом новом найденном коде — так
        // отмеченные объёмы одного приглашения не переносятся на другое.
        key={checkState.code}
        code={checkState.code as string}
        specialistName={checkState.specialistName as string}
        specialistVerified={checkState.specialistVerified === true}
        grantAction={grantAction}
        grantPending={grantPending}
        error={GRANT_ERRORS[grantState.status]}
        onDecline={() => setDeclinedCode(checkState.code ?? null)}
      />
    );
  }

  return (
    <form action={checkAction} className="spec-code-form">
      <div className="spec-field">
        <label htmlFor="code">Код от специалиста</label>
        <input
          id="code"
          name="code"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={INVITE_CODE_LENGTH + 2}
          placeholder="Например, ACDEFGHJ"
          required
        />
      </div>
      {CHECK_ERRORS[checkState.status] && <p className="form-error">{CHECK_ERRORS[checkState.status]}</p>}
      <div className="button-row">
        <button className="black-button" type="submit" disabled={checkPending}>
          {checkPending ? "Проверяем…" : "Проверить код"}
        </button>
        {!defaultOpen &&
          <button className="link-button" type="button" onClick={() => setOpened(false)}>Отмена</button>}
      </div>
    </form>
  );
}

function ConsentStep({
  code,
  specialistName,
  specialistVerified,
  grantAction,
  grantPending,
  error,
  onDecline,
}: {
  code: string;
  specialistName: string;
  /** Проверял ли профиль человек из сервиса. */
  specialistVerified: boolean;
  grantAction: (formData: FormData) => void;
  grantPending: boolean;
  error?: string;
  onDecline: () => void;
}) {
  // Ни один раздел не отмечен заранее: согласие на «доступ» вообще — это не
  // согласие, человек должен выбрать объём сам, глядя на конкретику ниже.
  const [checkedScopes, setCheckedScopes] = useState<AccessScope[]>([]);

  function toggleScope(scope: AccessScope) {
    setCheckedScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  return (
    <form action={grantAction} className="spec-consent-form">
      <input type="hidden" name="code" value={code} />

      <p className="spec-consent-lead">
        <b>{specialistName}</b> просит доступ к вашему дневнику.
      </p>
      {/* Откуда взялось имя — важнее самого имени. Специалисты заводят
          кабинет сами, и человек, увидевший «Марина Соколова, нутрициолог»,
          по умолчанию решит, что сервис её знает. Пока это не так, так и
          написано: открывать дневник он должен тому, кого узнал сам, а не
          тому, за кого мы молча поручились. */}
      <p className={specialistVerified ? "spec-consent-verified" : "spec-consent-unverified"}>
        {specialistVerified
          ? "Профиль проверен сервисом: мы убедились, что за этим именем стоит практика."
          : "Имя специалист указал сам — мы его не проверяли. Открывайте доступ, только если узнали человека и сами дали ему код."}
      </p>

      <fieldset className="spec-scope-fieldset">
        <legend>Что открыть</legend>
        {ACCESS_SCOPES.map((scope) => {
          const inputId = `consent-scope-${scope}`;
          return (
            <label key={scope} htmlFor={inputId} className="spec-scope-option">
              <input
                id={inputId}
                type="checkbox"
                name="scope"
                value={scope}
                checked={checkedScopes.includes(scope)}
                onChange={() => toggleScope(scope)}
              />
              <span>
                <b>{SCOPE_LABELS[scope]}</b>
                <small>{SCOPE_DETAILS[scope]}</small>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="spec-field">
        <label htmlFor="clientName">Как вас называть</label>
        <input id="clientName" name="clientName" type="text" maxLength={80} placeholder="Необязательно" />
        <p className="field-note">Специалист увидит это имя. Вашу почту он не увидит никогда.</p>
      </div>

      <p className="spec-consent-terms">
        Доступ действует только на чтение: специалист не может ничего изменить в вашем дневнике.
        Отозвать доступ можно в любой момент на этой странице.
      </p>

      {error && <p className="form-error">{error}</p>}

      <div className="button-row">
        <button className="black-button" type="submit" disabled={grantPending || checkedScopes.length === 0}>
          {grantPending ? "Открываем…" : "Открыть доступ"}
        </button>
        <button className="link-button" type="button" onClick={onDecline}>Отказаться</button>
      </div>
    </form>
  );
}
