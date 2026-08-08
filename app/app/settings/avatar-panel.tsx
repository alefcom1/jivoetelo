"use client";

import { useActionState, useRef, useState } from "react";
import { UserAvatar } from "../user-avatar";
import { removeAvatar, saveAvatar, type AvatarState } from "../avatar-actions";

/**
 * Фото профиля в настройках.
 *
 * Файл отправляется сразу по выбору, без отдельной кнопки «Загрузить». Шаг
 * «выберите файл → теперь нажмите сохранить» ничего не даёт: отменить выбор
 * всё равно нельзя — можно только выбрать другой, — а забыть нажать вторую
 * кнопку легко, и человек уходит уверенный, что фото поставил.
 *
 * Само поле спрятано и открывается кнопкой. Системный «Choose file / Файл не
 * выбран» выглядит чужеродно среди наших кнопок и на разных платформах
 * по-разному, а подпись у него не меняется.
 */
export function AvatarPanel({
  avatarKey,
  email,
  premium,
}: {
  avatarKey: string | null;
  email: string | null;
  premium: boolean;
}) {
  const [state, action, pending] = useActionState(saveAvatar, { status: "idle" } as AvatarState);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [removing, setRemoving] = useState(false);

  return <div className="avatar-panel">
    <UserAvatar avatarKey={avatarKey} email={email} premium={premium} size={72} />

    <div className="avatar-panel-body">
      <form ref={formRef} action={action}>
        <input
          ref={fileRef}
          className="visually-hidden"
          type="file"
          name="avatar"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={() => formRef.current?.requestSubmit()}
        />
        <button className="black-button" type="button" disabled={pending} onClick={() => fileRef.current?.click()}>
          {pending ? "Загружаем…" : avatarKey ? "Заменить фото" : "Загрузить фото"}
        </button>
      </form>

      {avatarKey && <button
        className="link-button"
        type="button"
        disabled={removing}
        onClick={async () => { setRemoving(true); try { await removeAvatar(); } finally { setRemoving(false); } }}
      >
        {removing ? "Убираем…" : "Убрать"}
      </button>}

      <p className="field-note">
        JPEG, PNG, WebP или GIF до 4 МБ. Без фото рисуется буква — она у каждого своя и
        одинаковая во всех наших экранах.
        {premium && " Корона на аватаре означает открытый доступ."}
      </p>
      {state.status === "failed" && <p className="form-error">{state.message}</p>}
    </div>
  </div>;
}
