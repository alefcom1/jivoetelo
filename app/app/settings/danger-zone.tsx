"use client";

import { useActionState, useState } from "react";
import { requestAccountDeletion, type DeleteAccountState } from "../account-actions";

/** Должно совпадать со словом, которое проверяет server action. */
const CONFIRMATION = "УДАЛИТЬ";

const errors: Partial<Record<DeleteAccountState["status"], string>> = {
  not_confirmed: `Чтобы удалить аккаунт, введите ${CONFIRMATION} заглавными буквами.`,
  error: "Не получилось удалить аккаунт. Попробуйте ещё раз или напишите нам.",
};

export function DangerZone() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(requestAccountDeletion, { status: "idle" } as DeleteAccountState);

  return <>
    <p>Удаление стирает аккаунт, все приёмы пищи, фотографии, вес и план. Это необратимо и происходит сразу — восстановить данные будет нельзя даже по вашей просьбе.</p>
    {open
      ? <form action={action}>
          <label htmlFor="confirmation">Введите {CONFIRMATION}, чтобы подтвердить:</label>
          <input id="confirmation" name="confirmation" type="text" autoComplete="off" autoFocus required />
          {errors[state.status] && <p className="form-error">{errors[state.status]}</p>}
          <div className="button-row">
            <button className="danger-button" type="submit" disabled={pending}>
              {pending ? "Удаляем…" : "Удалить аккаунт навсегда"}
            </button>
            <button className="link-button" type="button" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </form>
      : <button className="danger-button" type="button" onClick={() => setOpen(true)}>Удалить аккаунт</button>}
  </>;
}
