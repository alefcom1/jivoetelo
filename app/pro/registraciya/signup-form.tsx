"use client";

import { useActionState } from "react";
import { ABOUT_MAX, NAME_MAX } from "@/lib/pro/signup";
import { registerSpecialistAction, type SignupState } from "./actions";

/**
 * Форма кабинета. Четыре поля вместо семи в прежней анкете, и обязательное
 * из них одно — имя: остальное человек допишет, когда захочет, а сейчас ему
 * нужно начать работать.
 *
 * Подпись под именем важнее самого поля: клиент увидит именно эту строку на
 * экране согласия, и знать об этом до заполнения полезнее, чем после.
 */
export function SpecialistSignupForm({ profile }: { profile: { displayName: string; specialization: string | null; city: string | null; about: string | null } | null }) {
  const [state, action, pending] = useActionState(registerSpecialistAction, { status: "idle" } as SignupState);

  return <form action={action} className="pro-form">
    <div className="pro-field">
      <label htmlFor="sp-name">Имя{profile ? "" : " — его увидит клиент"}</label>
      <input
        id="sp-name"
        name="displayName"
        type="text"
        maxLength={NAME_MAX}
        required
        autoComplete="name"
        defaultValue={state.displayName ?? profile?.displayName ?? ""}
        placeholder="Марина Соколова"
      />
      <p className="field-note">
        Так вас увидит клиент на экране, где решает, что открыть. Без ссылок, телефонов и слов
        заглавными: там нужно имя, а не объявление.
      </p>
    </div>

    <div className="pro-field">
      <label htmlFor="sp-spec">Специализация</label>
      <input
        id="sp-spec"
        name="specialization"
        type="text"
        maxLength={100}
        defaultValue={state.specialization ?? profile?.specialization ?? ""}
        placeholder="Нутрициолог"
      />
    </div>

    <div className="pro-field">
      <label htmlFor="sp-city">Город</label>
      <input
        id="sp-city"
        name="city"
        type="text"
        maxLength={100}
        defaultValue={state.city ?? profile?.city ?? ""}
        placeholder="Где вы работаете"
      />
    </div>

    <div className="pro-field">
      <label htmlFor="sp-about">О практике</label>
      <textarea
        id="sp-about"
        name="about"
        rows={3}
        maxLength={ABOUT_MAX}
        defaultValue={state.about ?? profile?.about ?? ""}
        placeholder="Необязательно. Пригодится, когда мы будем подтверждать профиль."
      />
    </div>

    {!profile && <div className="pro-field pro-consent">
      <label>
        <input type="checkbox" name="consent" />
        <span>
          Подтверждаю, что веду частную практику, и принимаю{" "}
          <a href="/legal/terms" target="_blank" rel="noreferrer">условия</a> и{" "}
          <a href="/legal/privacy" target="_blank" rel="noreferrer">политику</a>.
        </span>
      </label>
    </div>}
    {/* При правке профиля галочки нет: условия человек принял при заведении,
        и требовать их заново на каждой смене города — способ приучить
        ставить галочки не читая. Действие всё равно проверяет согласие, и
        для правки оно подставляется здесь. */}
    {profile && <input type="hidden" name="consent" value="on" />}

    {state.status !== "idle" && state.message && <p className="form-error">{state.message}</p>}

    <button className="pro-submit" type="submit" disabled={pending}>
      {pending ? "Сохраняем…" : profile ? "Сохранить" : "Открыть кабинет"}
    </button>
  </form>;
}
