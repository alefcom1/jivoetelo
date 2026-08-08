import Link from "next/link";
import { accessPromptText, type AccessPrompt } from "@/lib/access-prompt";
import { ACCESS_ANCHOR } from "@/lib/paid";
import type { PayLink } from "@/lib/payments/access-links";

/**
 * Полоса о доступе на «Сегодня».
 *
 * Стоит на экране, который открывают каждый день, и появляется только когда
 * срок уже виден: за неделю до конца или после него (lib/access-prompt.ts).
 * До этого места на первом экране ей не отдаём — там должен быть день
 * человека, а не разговор про деньги.
 *
 * **Две кнопки, и вторая не для симметрии.** Приглашение — это не «а ещё у
 * нас есть реферальная программа», а второй полноценный способ продлить
 * доступ, причём бесплатный и без потолка. Показывать только оплату значит
 * умалчивать о том, что человеку выгоднее, — и он узнает об этом от
 * кого-нибудь другого, уже с осадком.
 */
export function AccessStrip({
  prompt,
  payLink,
}: {
  prompt: AccessPrompt;
  /** Самый дешёвый тариф — или null, когда приём денег выключен. */
  payLink: PayLink | null;
}) {
  const { title, body } = accessPromptText(prompt);

  return <section className={prompt.closed ? "access-strip access-strip--closed" : "access-strip"}>
    <div>
      <p className="access-strip-title">{title}</p>
      <p className="access-strip-body">{body}</p>
    </div>
    <div className="access-strip-actions">
      {payLink && <a className="black-button" href={payLink.url} target="_blank" rel="noopener noreferrer">
        {prompt.closed ? "Открыть разбор" : "Продлить"} — {payLink.priceRub} ₽
      </a>}
      {/* Ведёт в настройки, а не сразу к ссылке приглашения: код заводится
          по нажатию, и выдавать его каждому, кто просто открыл «Сегодня»,
          незачем (app/app/settings/invite-panel.tsx). */}
      <Link className="link-button" href={`/app/settings#${ACCESS_ANCHOR}`}>
        Позвать друга — месяц бесплатно
      </Link>
    </div>
  </section>;
}
