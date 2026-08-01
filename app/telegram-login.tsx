"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Кнопка «Войти через Telegram».
 *
 * ## Где она стоит и почему не в шапке
 *
 * Только на страницах входа и регистрации. В шапке её нет по трём причинам,
 * и первая из них решающая: виджет — это внешний скрипт с telegram.org, и в
 * шапке он грузился бы на каждой странице сайта, включая посадочную и
 * справочные, где входить никто не собирается. Вторая: способы входа надо
 * видеть рядом, чтобы выбирать между ними. Третья: в шапке уже есть «Войти»,
 * и она ведёт ровно туда, где лежат все способы сразу.
 *
 * ## Как это работает
 *
 * Скрипт Telegram сам вставляет свою кнопку на место элемента `script`,
 * поэтому его приходится добавлять в DOM вручную. Ответ приходит вызовом
 * функции, имя которой мы отдаём в `data-onauth`; данные оттуда уходят на
 * сервер телом POST, а не строкой запроса — см. app/api/auth/telegram.
 *
 * ## Чего ждать в разработке
 *
 * Виджет работает только с домена, указанного в BotFather. На localhost он
 * покажет кнопку, но вход не выполнит — это не поломка, а настройка Telegram.
 */

/** Имя функции, которую позовёт виджет. Уникальное, чтобы не столкнуться. */
const CALLBACK = "onJivoeteloTelegramAuth";

type Props = {
  /** Имя бота без «@». Пусто — кнопки нет вовсе. */
  botUsername: string | null;
  /**
   * Согласия, если они уже отмечены на странице. На входе их не спрашивают —
   * там ожидается существующий аккаунт; на регистрации без них аккаунт не
   * создаётся, и сервер это проверяет отдельно от интерфейса.
   */
  consent?: () => boolean;
};

export function TelegramLogin({ botUsername, consent }: Props) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Читаем согласия в момент ответа Telegram, а не в момент отрисовки:
  // человек мог отметить галочки уже после того, как кнопка появилась.
  const consentRef = useRef(consent);
  useEffect(() => { consentRef.current = consent; });

  useEffect(() => {
    if (!botUsername) return;
    const holder = holderRef.current;
    if (!holder) return;

    (window as unknown as Record<string, unknown>)[CALLBACK] = async (data: Record<string, unknown>) => {
      setError(null);
      setBusy(true);
      try {
        const response = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, consent: consentRef.current?.() ?? false }),
          signal: AbortSignal.timeout(20_000),
        });
        if (response.ok) {
          // Полная перезагрузка, а не router.push: сессия поставлена в cookie
          // ответом, и серверные компоненты должны увидеть уже вошедшего.
          window.location.assign("/app");
          return;
        }
        const payload = await response.json().catch(() => ({}));
        setError(MESSAGES[payload.reason as string] ?? MESSAGES.error);
      } catch {
        setError("Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.");
      } finally {
        setBusy(false);
      }
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "4");
    script.setAttribute("data-onauth", `${CALLBACK}(user)`);
    // Права на переписку не просим: для входа они не нужны, а лишний вопрос
    // в окне Telegram отпугивает ровно там, где человек решает, входить ли.
    script.setAttribute("data-userpic", "false");
    holder.appendChild(script);

    return () => {
      holder.replaceChildren();
      delete (window as unknown as Record<string, unknown>)[CALLBACK];
    };
  }, [botUsername]);

  if (!botUsername) return null;

  return <div className="tg-auth">
    <div className="tg-auth-or"><span>или</span></div>
    <div className="tg-auth-widget" ref={holderRef} aria-busy={busy} />
    {busy && <p className="field-note">Входим…</p>}
    {error && <p className="form-error">{error}</p>}
  </div>;
}

const MESSAGES: Record<string, string> = {
  needs_consent: "Чтобы создать аккаунт через Telegram, отметьте оба согласия выше.",
  not_configured: "Вход через Telegram сейчас недоступен. Войдите по почте и паролю.",
  invalid_signature: "Telegram не подтвердил вход. Попробуйте ещё раз.",
  error: "Не получилось войти через Telegram. Попробуйте ещё раз через минуту.",
};
