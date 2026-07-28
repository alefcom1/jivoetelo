import type { Metadata } from "next";
import UnsubscribeForm from "./unsubscribe-form";

export const metadata: Metadata = {
  title: "Отписка от писем — Живое Тело",
  description: "Отписаться от серии писем с разбором расчёта.",
  robots: { index: false, follow: false },
};

/**
 * Отписка не выполняется по самому переходу на страницу. Почтовые клиенты и
 * антивирусы открывают ссылки из писем сами, «на всякий случай», — и человек
 * оказался бы отписан, ни на что не нажимая. Поэтому здесь кнопка.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return <article className="legal-doc">
    <p className="kicker">Почта <i /></p>
    <h1>Отписка от писем</h1>
    {token
      ? <UnsubscribeForm token={token} />
      : <>
        <p>
          В ссылке нет метки, по которой можно найти подписку. Скорее всего, адрес скопирован из письма не
          целиком — откройте ссылку «Отписаться» из письма ещё раз.
        </p>
        <p>
          Если это не помогает, напишите на <a href="mailto:privacy@jivoetelo.ru">privacy@jivoetelo.ru</a>, и
          мы отпишем вас вручную.
        </p>
      </>}
  </article>;
}
