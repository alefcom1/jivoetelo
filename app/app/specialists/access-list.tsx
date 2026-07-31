"use client";

/**
 * Список доступов клиента: действующие — с изменением объёма и отзывом,
 * закрытые — отдельным блоком ниже как история, а не как ошибка, которую
 * прячут.
 *
 * Клиентский компонент, а не серверный список форм, ради двух вещей, которые
 * без локального состояния потребовали бы либо `window.confirm`, либо
 * отдельного экрана: подтверждения перед отзывом и раскрытия формы объёма
 * по клику, а не всегда открытой.
 */

import { useState } from "react";
import { ACCESS_SCOPES, SCOPE_DETAILS, SCOPE_LABELS, type AccessScope } from "@/lib/pro/access";
import type { ClientSideLink } from "@/lib/pro/store";
import { changeScopes, revoke } from "./actions";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

function grantedScopesOf(link: ClientSideLink): AccessScope[] {
  return ACCESS_SCOPES.filter((scope) =>
    scope === "summary" ? link.shareSummary : scope === "diary" ? link.shareDiary : link.shareWeight,
  );
}

export function AccessList({ links }: { links: ClientSideLink[] }) {
  const active = links.filter((link) => link.revokedAt === null);
  const revoked = links.filter((link) => link.revokedAt !== null);

  if (links.length === 0) {
    return <p className="field-note">Доступа не открыто ни у кого. Введите код приглашения, чтобы добавить специалиста.</p>;
  }

  return (
    <>
      {active.length === 0
        ? <p className="field-note">Действующих доступов сейчас нет.</p>
        : <ul className="spec-access-list">
            {active.map((link) => <AccessRow key={link.id} link={link} />)}
          </ul>}

      {revoked.length > 0 &&
        <div className="spec-revoked">
          <p className="spec-revoked-title">Доступ закрыт</p>
          <ul className="spec-access-list spec-access-list-revoked">
            {revoked.map((link) => (
              <li key={link.id} className="spec-access-row spec-access-row-revoked">
                <div className="spec-access-head">
                  <b>{link.specialistName}</b>
                  <span>закрыт {dateFormat.format(link.revokedAt as Date)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>}
    </>
  );
}

function AccessRow({ link }: { link: ClientSideLink }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-revoke">("view");
  const granted = grantedScopesOf(link);
  const [checkedScopes, setCheckedScopes] = useState<AccessScope[]>(granted);

  function openEdit() {
    setCheckedScopes(granted);
    setMode("edit");
  }

  function toggleScope(scope: AccessScope) {
    setCheckedScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  return (
    <li className="spec-access-row">
      <div className="spec-access-head">
        <b>{link.specialistName}</b>
        <span>открыт {dateFormat.format(link.acceptedAt)}</span>
      </div>
      <p className="spec-access-scopes">
        {granted.length === 0 ? "Ни один раздел не открыт." : granted.map((scope) => SCOPE_LABELS[scope]).join(", ")}
      </p>

      {mode === "view" &&
        <div className="button-row">
          <button className="link-button" type="button" onClick={openEdit}>Изменить объём</button>
          <button
            className="link-button"
            type="button"
            onClick={() => setMode("confirm-revoke")}
            aria-label={`Отозвать доступ у специалиста ${link.specialistName}`}
          >
            Отозвать доступ
          </button>
        </div>}

      {mode === "edit" &&
        <form action={changeScopes} className="spec-scope-form" onSubmit={() => setMode("view")}>
          <input type="hidden" name="linkId" value={link.id} />
          <fieldset className="spec-scope-fieldset">
            <legend>Что открыто у {link.specialistName}</legend>
            {ACCESS_SCOPES.map((scope) => {
              const inputId = `link-${link.id}-scope-${scope}`;
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
          {checkedScopes.length === 0 &&
            <p className="field-note">Без единого отмеченного раздела доступ будет закрыт целиком — как при отзыве.</p>}
          <div className="button-row">
            <button className="black-button" type="submit">Сохранить</button>
            <button className="link-button" type="button" onClick={() => setMode("view")}>Отмена</button>
          </div>
        </form>}

      {mode === "confirm-revoke" &&
        <form action={revoke} className="spec-revoke-confirm" onSubmit={() => setMode("view")}>
          <input type="hidden" name="linkId" value={link.id} />
          <p>Отозвать доступ у {link.specialistName}? Доступ закроется сразу, специалист больше не увидит ваши данные.</p>
          <div className="button-row">
            <button className="danger-button" type="submit" aria-label={`Подтвердить отзыв доступа у ${link.specialistName}`}>
              Отозвать доступ
            </button>
            <button className="link-button" type="button" onClick={() => setMode("view")}>Не отзывать</button>
          </div>
        </form>}
    </li>
  );
}
