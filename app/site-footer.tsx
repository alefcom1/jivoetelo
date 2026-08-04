import Link from "next/link";
import { botLink } from "@/lib/bot-public";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";

/**
 * Подвал сайта — один на все публичные страницы.
 *
 * ## Почему общий
 *
 * Раньше подвал существовал только на главной, а `/pro`, расчёты, каталог
 * блюд и документы заканчивались ничем. Это не косметика:
 *
 * - Политику конфиденциальности оператор обязан держать доступной, а не
 *   прятать на одной странице из десяти. С поиска человек попадает сразу на
 *   `/skolko-kalorij/borshch`, и оттуда до документов дороги не было.
 * - Оговорка о том, что сервис не заменяет врача, нужна прежде всего там,
 *   где выдаются цифры, — то есть на расчётах. Она же висела на главной.
 * - Страница без выхода — тупик: посмотреть продукт после статьи было не по
 *   чему, кроме логотипа в шапке.
 *
 * ## Верхний блок — не часть подвала
 *
 * Крупный призыв «Начните слышать себя» уместен в конце главной и неуместен
 * в конце пользовательского соглашения. Поэтому он передаётся снаружи через
 * `children`, а без него подвал начинается сразу со ссылок — отступ снимает
 * правило `footer > .footer-links:first-child`.
 *
 * Компонент нарочно без `"use client"` и без обращений к дате и окружению:
 * его подключают и серверные layout'ы разделов, и клиентская главная.
 *
 * ## `authed`
 *
 * Тот же подвал стоит и в кабинете. Звать вошедшего человека «начать
 * бесплатно» и «войти» — значит предлагать ему то, что он уже сделал, поэтому
 * под учётной записью эти две ссылки заменяются на дорогу внутрь кабинета.
 * Остальные колонки одинаковы: документы и расчёты нужны одинаково и до
 * регистрации, и после.
 */
export function SiteFooter({ children, authed = false }: { children?: React.ReactNode; authed?: boolean }) {
  return <footer id="about">
    {children}
    <div className="footer-links">
      <div>
        <p>Сервис</p>
        <Link href="/">Главная</Link>
        <Link href="/pro">Для специалистов</Link>
        {authed
          ? <>
              <Link href="/app">Мой дневник</Link>
              <Link href="/app/settings">Настройки</Link>
            </>
          : <>
              <Link href="/register">Начать бесплатно</Link>
              <Link href="/login">Войти</Link>
            </>}
      </div>
      <div>
        <p>Расчёты</p>
        <Link href="/raschet/plan">Ваш стартовый коридор</Link>
        <Link href="/raschet">Все расчёты</Link>
        <Link href="/skolko-kalorij">Калорийность блюд</Link>
        <Link href="/raschet/energiya">Сколько энергии нужно</Link>
        <Link href="/raschet/belok">Сколько белка нужно</Link>
        <Link href="/raschet/temp">С какой скоростью снижать вес</Link>
        <Link href="/raschet/kviz">Что вам сейчас подходит</Link>
      </div>
      <div>
        <p>Документы</p>
        <Link href="/legal/terms">Пользовательское соглашение</Link>
        <Link href="/legal/privacy">Политика конфиденциальности</Link>
        <Link href="/legal/consent">Согласие на обработку данных</Link>
        <Link href="/legal/health">Границы сервиса</Link>
        <Link href="/legal/cookies">Файлы cookie</Link>
      </div>
      <div>
        <p>Связаться</p>
        <a href="mailto:privacy@jivoetelo.ru">privacy@jivoetelo.ru</a>
        <a href={botLink()} target="_blank" rel="noreferrer">Бот в Telegram</a>
        <Link href="/legal">Все документы</Link>
      </div>
    </div>
    <p className="footer-disclaimer">
      {NOT_MEDICAL_DISCLAIMER} <Link href="/legal/health">Подробнее о границах сервиса →</Link>
    </p>
    <div className="footer-bottom"><span>© Живое Тело, 2026</span></div>
  </footer>;
}
