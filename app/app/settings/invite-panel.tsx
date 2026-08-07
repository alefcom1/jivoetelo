"use client";

/**
 * Приглашение друзей в настройках.
 *
 * Появился здесь вместе с пробным месяцем, и не для красоты. До этого
 * программа приглашений жила только в боте по /invite и в Mini App: в вебе
 * входа в неё не было вовсе. Пока бесплатный тариф был бессрочным, это была
 * мелочь — приглашение просто поднимало лимиты. Теперь это единственный
 * способ продлить доступ без денег, и на него ссылаются и отказ в разборе,
 * и блок «Доступ» выше, и главная страница. Ссылка, которой нет там, куда
 * её послали искать, — обещание, которое сервис не выполняет.
 *
 * Ссылка берётся действием по нажатию, а не приходит с сервера вместе со
 * страницей: код заводится при первом обращении, и выдавать его каждому,
 * кто просто открыл настройки, незачем.
 */

import { useState } from "react";
import { REFERRAL_REWARD_AFTER_DAYS, REFERRAL_REWARD_DAYS } from "@/lib/referral";
import { inviteLink } from "../share-actions";

export function InvitePanel() {
  const [state, setState] = useState<{ link: string; invited: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function reveal() {
    setBusy(true);
    try {
      setState(await inviteLink());
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(state.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер обмена недоступен — без паники: ссылка на экране, её видно и
      // можно выделить руками. Сообщать об ошибке тут не о чем.
    }
  }

  return <div className="access-panel">
    <p>
      За каждого, кто заведёт дневник по вашей ссылке, {REFERRAL_REWARD_DAYS} дней доступа
      получите и вы, и он. Сколько привели — столько месяцев, потолка нет.
    </p>
    {/* Условие названо целиком, включая неудобную половину. Умолчать значило
        бы пообещать месяц за нажатие — и получить обиду ровно у тех, кто
        поверил. */}
    <p className="access-note">
      Начисление приходит, когда приглашённый наберёт {REFERRAL_REWARD_AFTER_DAYS} дней с записями, —
      а не в день перехода по ссылке. Иначе это была бы награда за заведённые аккаунты, а не за
      приведённых людей.
    </p>

    {state
      ? <>
          <div className="link-code-box">
            <strong className="invite-link">{state.link}</strong>
            <span>{state.invited === 0
              ? "По ней пока никто не пришёл."
              : `По ней уже завели дневник: ${state.invited}.`}</span>
          </div>
          <button className="white-button" onClick={copy}>{copied ? "Скопировано" : "Скопировать ссылку"}</button>
        </>
      : <button className="black-button" onClick={reveal} disabled={busy}>
          {busy ? "Готовим…" : "Получить ссылку"}
        </button>}
  </div>;
}
