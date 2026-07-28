import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_UPDATED_AT } from "@/lib/legal";
import { formatLegalDate, LegalMeta, LegalNav } from "../nav";

export const metadata: Metadata = {
  title: "Файлы cookie — Живое Тело",
  description: "Какие cookie использует «Живое Тело» и почему на сайте нет баннера о согласии.",
};

export default function CookiesPage() {
  return <article className="legal-doc">
    <p className="kicker">Документы <i /></p>
    <h1>Файлы <em>cookie</em></h1>
    <LegalMeta />

    <div className="legal-callout">
      <p><strong>Почему у нас нет баннера про cookie.</strong> Мы используем ровно один файл cookie — тот, что держит вас авторизованным. Он строго необходим для работы сайта, и согласия на него не требуется. Отслеживающих, рекламных и аналитических cookie на сайте нет, поэтому спрашивать не о чем.</p>
    </div>

    <h2>1. Что мы используем</h2>
    <div className="legal-table-scroll">
      <table className="legal-table">
        <thead><tr><th>Имя</th><th>Назначение</th><th>Срок</th><th>Тип</th></tr></thead>
        <tbody>
          <tr>
            <td><code>jt_session</code></td>
            <td>Хранит случайный токен сессии, чтобы вы не вводили пароль на каждой странице. Никаких сведений о вас внутри не содержит.</td>
            <td>30 дней</td>
            <td>Строго необходимый</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>Cookie устанавливается только после входа в аккаунт. На публичных страницах — главной, странице входа и этих документах — cookie не устанавливаются.</p>

    <h2>2. Свойства</h2>
    <ul>
      <li><code>HttpOnly</code> — cookie недоступен скриптам на странице, это защита от кражи сессии через XSS.</li>
      <li><code>Secure</code> — передаётся только по HTTPS.</li>
      <li><code>SameSite=Lax</code> — не отправляется на сторонние сайты.</li>
      <li>В базе хранится не сам токен, а его хеш: даже при доступе к базе восстановить рабочую cookie нельзя.</li>
    </ul>

    <h2>3. Чего у нас нет</h2>
    <ul>
      <li>Счётчиков сторонних систем аналитики.</li>
      <li>Рекламных пикселей и трекеров социальных сетей.</li>
      <li>Cookie для профилирования и таргетирования.</li>
    </ul>
    <p>Если мы подключим статистику посещаемости, это будет система, размещённая на нашем же сервере и не устанавливающая идентифицирующих cookie. Мы обновим этот документ до того, как что-либо появится на сайте.</p>

    <h2>4. Как отказаться</h2>
    <p>Отключить строго необходимый cookie в браузере можно, но тогда вход в аккаунт работать не будет — сервер не сможет отличить вас от анонимного посетителя. Публичные страницы останутся доступны.</p>
    <p>Выйти из аккаунта и удалить cookie можно кнопкой «Выйти» в приложении.</p>

    <h2>5. Telegram Mini App</h2>
    <p>Внутри Telegram Mini App cookie не используются: сессия подтверждается подписью, которую Telegram передаёт приложению при запуске.</p>

    <p>Подробнее об обработке данных — в <Link href="/legal/privacy">Политике конфиденциальности</Link>. Редакция от {formatLegalDate(LEGAL_UPDATED_AT)}.</p>

    <LegalNav current="/legal/cookies" />
  </article>;
}
